import asyncio
from contextlib import asynccontextmanager
import io
import os
import threading
import warnings
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from engine import Engine, SUPPORTED

MAX_BYTES = 20 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 20_000_000


class BodyLimit:
    """Bound multipart bodies even before the upload parser writes temporary files."""
    def __init__(self, app): self.app = app
    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        total = 0
        async def bounded():
            nonlocal total
            message = await receive()
            total += len(message.get('body', b''))
            if total > MAX_BYTES + 65536:
                raise HTTPException(413, 'Upload must be under 20 MB.')
            return message
        await self.app(scope, bounded, send)


def decode_image(payload):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(payload)) as image:
                if image.width * image.height > 20_000_000:
                    raise HTTPException(413, 'Image dimensions are too large. Resize the page.')
                image = ImageOps.exif_transpose(image).convert('RGB')
                image.thumbnail((3200, 3200))
                output = io.BytesIO()
                image.save(output, format='PNG')
                return output.getvalue()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, 'Upload a readable page image. PDF pages are rendered by the browser first.')


def create_app(engine=None):
    engine = engine or Engine()
    @asynccontextmanager
    async def lifespan(app):
        yield
        await asyncio.to_thread(engine.close)

    app = FastAPI(title='PixelPDF PaddleOCR', lifespan=lifespan)
    app.state.engine = engine
    origins = [origin.strip() for origin in os.getenv('OCR_ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',') if origin.strip()]
    app.add_middleware(BodyLimit)
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET','POST'], allow_headers=['Content-Type'], allow_credentials=False)

    @app.get('/health')
    @app.get('/api/ocr/health')
    def health():
        return {'service': 'PixelPDF PaddleOCR', 'model': 'PP-OCRv5', 'status': engine.status, 'languages': sorted(SUPPORTED), 'profile': os.getenv('OCR_PROFILE', 'cpu')}

    @app.post('/api/ocr')
    async def ocr(request: Request, file: UploadFile = File(...), language: str = Form('eng')):
        if language not in SUPPORTED:
            await file.close()
            raise HTTPException(422, 'Select one of the supported text languages.')
        try:
            payload = await file.read(MAX_BYTES + 1)
            if len(payload) > MAX_BYTES:
                raise HTTPException(413, 'Upload must be under 20 MB.')
            clean = await asyncio.to_thread(decode_image, payload)
        finally:
            await file.close()
        stop = threading.Event()
        task = asyncio.create_task(asyncio.to_thread(engine.recognize, clean, language, stop))
        try:
            while not task.done():
                if await request.is_disconnected():
                    stop.set()
                    # Wait for the worker to release its slot, but never leak its exception.
                    try: await task
                    except Exception: pass
                    raise HTTPException(499, 'Scan cancelled.')
                await asyncio.wait({task}, timeout=0.2)
            return await task
        except TimeoutError as error:
            raise HTTPException(504, str(error))
        except RuntimeError as error:
            if str(error) == 'busy':
                raise HTTPException(429, 'The scanner is processing another page. Retry shortly.', headers={'Retry-After':'3'})
            raise HTTPException(503, str(error))
        except asyncio.CancelledError:
            stop.set()
            raise
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(503, 'The scanner could not finish this page. Check backend logs or use browser scanning.')
    return app

app = create_app()
