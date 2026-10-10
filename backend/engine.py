"""Isolate Paddle inference so stalled requests can be stopped safely."""
import json
import math
import multiprocessing as mp
import os
from pathlib import Path
import threading
import time

SUPPORTED = {'eng', 'fra', 'spa', 'por', 'deu'}


def normalize_results(results):
    lines = []
    for result in results:
        data = result.json if hasattr(result, 'json') else result
        if callable(data):
            data = data()
        if isinstance(data, str):
            data = json.loads(data)
        data = data.get('res', data)
        texts, scores = data.get('rec_texts', []), data.get('rec_scores', [])
        for index, text in enumerate(texts):
            text = str(text).strip()
            if not text:
                continue
            score = float(scores[index]) if index < len(scores) else 0.0
            score = min(1.0, max(0.0, score)) if math.isfinite(score) else 0.0
            lines.append({'text': text, 'confidence': round(score * 100, 2)})
    return {'text': '\n'.join(line['text'] for line in lines),
            'confidence': round(sum(line['confidence'] for line in lines) / len(lines), 2) if lines else 0,
            'uncertain': list(dict.fromkeys(line['text'] for line in lines if line['confidence'] < 75)),
            'lines': lines, 'engine': 'PaddleOCR PP-OCRv5'}


def model_options(language):
    profile = os.getenv('OCR_PROFILE', 'cpu')
    if profile not in {'cpu', 'server'}:
        raise ValueError('OCR_PROFILE must be cpu or server.')
    options = dict(
        text_detection_model_name=os.getenv('OCR_DETECTION_MODEL') or f'PP-OCRv5_{"mobile" if profile == "cpu" else "server"}_det',
        text_recognition_model_name=os.getenv('OCR_RECOGNITION_MODEL') or (
            ('en_PP-OCRv5_mobile_rec' if profile == 'cpu' else 'PP-OCRv5_server_rec')
            if language == 'eng' else 'latin_PP-OCRv5_mobile_rec'),
        device=os.getenv('OCR_DEVICE', 'cpu'), cpu_threads=int(os.getenv('OCR_CPU_THREADS', '2')),
        enable_mkldnn=False, use_doc_orientation_classify=True,
        use_doc_unwarping=False, use_textline_orientation=True,
        text_det_limit_side_len=int(os.getenv('OCR_DETECTION_SIDE', '1600')),
        text_det_limit_type='max', text_recognition_batch_size=4,
        textline_orientation_batch_size=4, text_rec_score_thresh=0.0)
    # PaddleX 3.2's model-name resolver can require a reachable model host even
    # when downloads exist. Explicit directories bypass that resolver offline.
    cache = Path(os.getenv('PADDLE_PDX_CACHE_HOME') or Path.home() / '.paddlex') / 'official_models'
    models = {
        'text_detection_model_dir': options['text_detection_model_name'],
        'text_recognition_model_dir': options['text_recognition_model_name'],
        'doc_orientation_classify_model_dir': 'PP-LCNet_x1_0_doc_ori',
        'textline_orientation_model_dir': 'PP-LCNet_x1_0_textline_ori',
    }
    for key, name in models.items():
        folder = cache / name
        if (folder / 'inference.yml').is_file() and any((folder / name).is_file() for name in ['inference.json', 'inference.pdmodel', 'model.json']) and any(
            path.is_file() and path.stat().st_size > 0
            for path in [folder / 'inference.pdiparams', folder / 'model.pdiparams']
        ):
            options[key] = str(folder)
    return options



def _worker(connection):
    # Import only inside the isolated process; the API remains responsive.
    try:
        models = {}
        while True:
            payload, language = connection.recv()
            # Receive first so a slow dependency import cannot block the parent's upload pipe.
            from paddleocr import PaddleOCR
            import numpy as np
            from PIL import Image
            import io
            key = 'eng' if language == 'eng' else 'latin'
            if key not in models:
                connection.send(('loading', None))
                options = model_options(language)
                models[key] = PaddleOCR(**options)
                connection.send(('ready', None))
            with Image.open(io.BytesIO(payload)) as image:
                rgb = np.array(image.convert('RGB'))
            # Paddle's numpy input convention is BGR (matching OpenCV).
            connection.send(('processing', None))
            output = normalize_results(models[key].predict(rgb[:, :, ::-1].copy()))
            connection.send(('result', output))
    except EOFError:
        pass
    except Exception:
        import traceback
        traceback.print_exc()  # server diagnostics; never log uploaded content
        try:
            connection.send(('error', 'PaddleOCR could not load or process the page. Check backend logs, model downloads and dependencies.'))
        except (BrokenPipeError, EOFError, OSError):
            pass
    finally:
        connection.close()


class Engine:
    def __init__(self, timeout=None):
        self.timeout = timeout or int(os.getenv('OCR_TIMEOUT_SECONDS', '240'))
        self.process = None
        self.connection = None
        self.lock = threading.Lock()
        self.status = 'not_started'
        self.started_at = None

    def close(self):
        if self.process:
            self.process.terminate()
            self.process.join(timeout=5)
            if self.process.is_alive():
                self.process.kill()
                self.process.join(timeout=2)
        if self.connection:
            self.connection.close()
        self.process = self.connection = None

    def recognize(self, payload, language, cancelled=None):
        if not self.lock.acquire(blocking=False):
            raise RuntimeError('busy')
        try:
            if not self.process or not self.process.is_alive():
                self.close()
                ctx = mp.get_context('spawn')
                self.connection, child = ctx.Pipe()
                self.process = ctx.Process(target=_worker, args=(child,), daemon=True)
                self.process.start()
                child.close()
                self.status = 'loading'
            self.started_at = time.monotonic()
            self.status = 'loading'
            self.connection.send((payload, language))
            deadline = time.monotonic() + self.timeout
            while time.monotonic() < deadline:
                if cancelled and cancelled.is_set():
                    self.close()
                    self.status = 'not_started'
                    raise RuntimeError('cancelled')
                if self.connection.poll(0.1):
                    kind, value = self.connection.recv()
                    if kind in {'loading', 'ready', 'processing'}:
                        self.status = kind
                    elif kind == 'result':
                        self.status = 'ready'
                        return value
                    else:
                        raise RuntimeError(value)
                if not self.process.is_alive():
                    raise RuntimeError('PaddleOCR worker stopped. Check available RAM and backend logs.')
            raise TimeoutError(f'PaddleOCR timed out during {self.status} after {self.timeout}s. Try the CPU profile and a smaller page.')
        except Exception:
            self.close()
            self.status = 'error'
            raise
        finally:
            self.started_at = None
            self.lock.release()
