"""Download/cache models before opening the app; rerun safely if interrupted."""
import io
from PIL import Image
from engine import Engine

if __name__ == '__main__':
    page = Image.new('RGB', (320, 160), 'white')
    output = io.BytesIO()
    page.save(output, format='PNG')
    engine = Engine(timeout=900)
    try:
        for language in ['eng', 'fra']:
            print(f'Preparing PP-OCRv5 ({language})…', flush=True)
            engine.recognize(output.getvalue(), language)
        print('Models ready. Start the backend now.', flush=True)
    finally:
        engine.close()
