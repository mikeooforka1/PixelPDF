# PixelPDF: PaddleOCR PP-OCRv5 update

This is an UPDATE kit: merge `src/` into your existing PixelPDF project and add `backend/` beside `src/`. Do not replace your entire project. Keep your existing App.jsx, PWA files, OCR assets, PDF assets and other tools. Yarn remains the frontend package manager; Python dependencies use pip inside a separate virtual environment.

## Start on Windows

Install 64-bit Python 3.11 (recommended for this pinned CPU setup). Open PowerShell in the project's backend folder:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python warmup.py
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1
```

If PowerShell activation is restricted, call `.\.venv\Scripts\python.exe` directly for each Python command; no policy change is required.

`warmup.py` downloads English and Latin-script models to the server user's PaddleX cache. It prints progress and may take time on the first run. Leave it running until “Models ready”. No external API key is needed. Model weights and the Python environment are NOT included in this ZIP. The CPU package/model downloads are substantially larger than the old browser OCR assets.

In a SECOND terminal at the PixelPDF project root:

```powershell
yarn start
```

Open http://localhost:3000, select Scan to Document, choose **PaddleOCR PP-OCRv5 · server**, upload a clear page and click Scan pages. Stored PDF/DOCX/text content still imports locally; photo and scanned-PDF page images go to your backend. The browser fallback stays available and is labelled if used. The engine defaults to Browser OCR to preserve existing private/offline behavior; select PaddleOCR for the comparison. PDF to Text has the same engine choice for image-only pages.

## Linux/macOS

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python warmup.py
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1
```

Linux OpenCV may need `libgl1`, `libglib2.0-0` and `libgomp1`. Dockerfile includes them. CPU is the default; install the appropriate official PaddlePaddle GPU package before choosing a GPU device. Do not install both CPU and GPU Paddle packages together.

## Test YOUR actual scans

In the backend terminal with its environment active:

```bash
python benchmark.py path/to/scan.png
python benchmark.py path/to/handwriting.jpg --expected path/to/correct-transcription.txt
```

The expected file must be your manually checked UTF-8 transcription. Output includes recognized lines, confidence, elapsed seconds, character error rate and word error rate (lower error rates are better). First inference includes model load time. Use the same pages and transcription to compare engines; engine confidence values are not directly comparable and do not prove accuracy. Try printed and genuine handwritten samples separately. No engine guarantees all handwriting.

## Deploy the website AND backend

The Python backend requires a Python/container host; a static site host alone cannot run it. Deploy backend/ using the included Dockerfile or Python service command `python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1` (use your host's assigned port where required). Set `OCR_ALLOWED_ORIGINS` to your exact frontend HTTPS origin, such as `https://pixelpdf.example`; multiple origins are comma-separated. Configure persistent model cache storage to avoid repeated model downloads on ephemeral hosts. Keep one API worker per service instance; inference is serialized to bound CPU/RAM use, and extra concurrent requests receive a retryable busy response. Scale instances when needed. Provision RAM/CPU based on measurements; free hosting tiers may be insufficient for server models.

In the REACT project root, create `.env.local`:

```dotenv
REACT_APP_OCR_SERVER_URL=https://your-ocr-backend.example
```

Run `yarn build` and deploy the entire build folder. That variable must be set BEFORE building. It is the server origin without `/api/ocr` appended. Localhost points to each user's own device, so do not deploy a localhost server URL. If you leave the variable unset in production, the app expects `/api/ocr` on its own origin through a reverse proxy to the Python backend. Both approaches work for installed apps as well as browser visits. Public HTTPS sites need HTTPS backend endpoints. Your reverse proxy should allow a 20 MB body and an inference timeout of at least 300 seconds. The health endpoint is `/health` or `/api/ocr/health`; `not_started` means models will initialize on first scan. Avoid logging request bodies/documents in your hosting proxy, and use your host's rate limits if exposing this publicly.

Installed users get the rebuilt app through the existing Update available → Update and reload flow. Server scanning requires reaching the backend; browser scanning works offline after offline tools have been prepared. Scans are not permanently saved by this backend: bounded multipart temporary storage is closed after each request; inference uses memory. No uploaded document content is cached by the PWA.

## Model configuration

English: `PP-OCRv5_server_det` + `PP-OCRv5_server_rec`. French/Spanish/Portuguese/German: the same detector + `latin_PP-OCRv5_mobile_rec`, sharing one Latin-script instance. Document/text-line orientation is enabled; document unwarping is disabled. CPU threads default to 2. MKL-DNN is disabled for compatibility in this pinned setup. `OCR_DETECTION_MODEL=PP-OCRv5_mobile_det` reduces detector resource use if your machine struggles; benchmark the tradeoff. Low-confidence recognized lines are retained for manual review. Full page reading order still needs checking, especially multi-column layouts.

## Automated checks and limits

```bash
# backend
python -m pip install -r requirements-test.txt
python -m unittest -v test_backend.py
# frontend project root (tests included in src/)
yarn test:ci
yarn build
```

Input is a rendered page image, capped at 20 MB and 20 million decoded pixels; the server resizes to a maximum side of 3200px. Browser import limits still apply. The isolated inference process is stopped on timeout/client disconnect and recreated for the next scan. Busy scans are not queued without bounds. No password-protected/corrupt PDF workaround is attempted.

## Validation performed for this update

The pinned PaddlePaddle/PaddleOCR packages installed and the real initialization path was attempted. This execution environment could not reach PaddleOCR model hosting services, so REAL model inference/handwriting accuracy could not be validated here. 35 frontend tests, 12 backend tests, a production frontend build, server upload/response UI checks and all nine offline tool workflows passed. Backend/API and UI tests use controlled engine results; they validate integration, upload limits, errors, low-confidence retention and fallback, not OCR accuracy. Run warmup.py and benchmark.py on your own computer to complete the real-model test. This limitation is not hidden by the browser fallback: review identifies the engine used.
