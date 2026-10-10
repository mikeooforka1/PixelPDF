import io
import unittest
import threading
import time
import tempfile
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from PIL import Image
from engine import Engine, normalize_results, model_options
from main import create_app, MAX_BYTES

def page_bytes():
    output=io.BytesIO();Image.new('RGB',(100,50),'white').save(output,format='PNG');return output.getvalue()
class FakeEngine:
    status='ready'
    def close(self): pass
    def recognize(self,payload,language,cancelled):
        assert payload.startswith(b'\x89PNG')
        return normalize_results([{'res':{'rec_texts':['Invoice 12345','faint writing'],'rec_scores':[.98,.05]}}])
def stalled_worker(connection):
    connection.recv()
    connection.send(('loading',None))
    time.sleep(20)

class BackendTests(unittest.TestCase):
    def setUp(self): self.client=TestClient(create_app(FakeEngine()))
    def scan(self,payload=None,**kwargs): return self.client.post('/api/ocr',files={'file':('page.png',payload or page_bytes(),'image/png')},**kwargs)
    def test_cpu_models(self):
        with patch.dict('os.environ', {}, clear=True):
            options=model_options('eng')
            self.assertEqual(options['text_detection_model_name'],'PP-OCRv5_mobile_det')
            self.assertEqual(options['text_recognition_model_name'],'en_PP-OCRv5_mobile_rec')
            self.assertEqual(options['text_det_limit_type'],'max')
            self.assertNotIn('ocr_version',options)
            self.assertEqual(model_options('fra')['text_recognition_model_name'],'latin_PP-OCRv5_mobile_rec')
    def test_server_models_and_override(self):
        with patch.dict('os.environ', {'OCR_PROFILE':'server'}, clear=True):
            self.assertEqual(model_options('eng')['text_recognition_model_name'],'PP-OCRv5_server_rec')
        with patch.dict('os.environ', {'OCR_PROFILE':'bad'}, clear=True):
            with self.assertRaises(ValueError): model_options('eng')
    def test_downloaded_models_use_explicit_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict('os.environ', {'PADDLE_PDX_CACHE_HOME':directory}, clear=True):
                names=['PP-OCRv5_mobile_det','en_PP-OCRv5_mobile_rec','PP-LCNet_x1_0_doc_ori','PP-LCNet_x1_0_textline_ori']
                for name in names:
                    folder=Path(directory)/'official_models'/name
                    folder.mkdir(parents=True)
                    (folder/'inference.yml').write_text('test config')
                    (folder/'inference.json').write_text('{}')
                    (folder/'inference.pdiparams').write_bytes(b'test weight')
                options=model_options('eng')
                self.assertEqual(len([key for key in options if key.endswith('_model_dir')]),4)
                self.assertEqual(options['text_recognition_model_dir'],str(Path(directory)/'official_models'/names[1]))
    def test_partial_model_cache_is_not_treated_as_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict('os.environ', {'PADDLE_PDX_CACHE_HOME':directory}, clear=True):
                folder=Path(directory)/'official_models'/'PP-OCRv5_mobile_det'
                folder.mkdir(parents=True);(folder/'inference.yml').write_text('partial')
                self.assertNotIn('text_detection_model_dir',model_options('eng'))
    def test_health(self): self.assertEqual(self.client.get('/health').json()['model'],'PP-OCRv5')
    def test_low_confidence_is_preserved(self):
        result=self.scan().json();self.assertIn('faint writing',result['text']);self.assertEqual(result['uncertain'],['faint writing'])
    def test_invalid_image(self): self.assertEqual(self.scan(b'not an image').status_code,422)
    def test_invalid_language(self): self.assertEqual(self.scan(data={'language':'bad'}).status_code,422)
    def test_oversized_body(self): self.assertEqual(self.scan(b'x'*(MAX_BYTES+70000)).status_code,413)
    def test_busy(self):
        with patch.object(self.client.app.state.engine,'recognize',side_effect=RuntimeError('busy')):
            response=self.scan();self.assertEqual(response.status_code,429);self.assertEqual(response.headers['retry-after'],'3')
    def test_timeout(self):
        with patch.object(self.client.app.state.engine,'recognize',side_effect=TimeoutError('timed out')): self.assertEqual(self.scan().status_code,504)
    def test_cors(self):
        self.assertEqual(self.client.options('/api/ocr',headers={'Origin':'http://localhost:3000','Access-Control-Request-Method':'POST'}).status_code,200)
        self.assertNotIn('access-control-allow-origin',self.client.options('/api/ocr',headers={'Origin':'https://wrong.example','Access-Control-Request-Method':'POST'}).headers)
    def test_normalization(self):
        result=normalize_results([{'rec_texts':['','0','text'],'rec_scores':[.5,0,float('nan')]}]);self.assertEqual(result['text'],'0\ntext');self.assertEqual(result['confidence'],0)
    def test_engine_admission(self):
        engine=Engine();engine.lock.acquire()
        try:
            with self.assertRaisesRegex(RuntimeError,'busy'): engine.recognize(b'','eng')
        finally: engine.lock.release()
    def test_process_timeout_stops_inference(self):
        engine=Engine(timeout=1)
        with patch('engine._worker',stalled_worker):
            with self.assertRaises(TimeoutError): engine.recognize(page_bytes(),'eng')
        self.assertIsNone(engine.process)
        self.assertFalse(engine.lock.locked())
    def test_process_cancel_releases_slot(self):
        engine=Engine(timeout=5);stop=threading.Event();errors=[]
        def run():
            try: engine.recognize(page_bytes(),'eng',stop)
            except RuntimeError as error: errors.append(str(error))
        with patch('engine._worker',stalled_worker):
            thread=threading.Thread(target=run);thread.start();time.sleep(.2);stop.set();thread.join(timeout=5)
        self.assertFalse(thread.is_alive());self.assertEqual(errors,['cancelled']);self.assertIsNone(engine.process)

if __name__=='__main__': unittest.main()
