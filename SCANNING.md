# New PixelPDF tools

## Start with Yarn
Use Node.js 22.9+ (Node 24 LTS recommended) and the project's Yarn 4.18.0.

```sh
corepack enable
yarn install --immutable
yarn start
```

Open More Tools → Scan to Document or PDF to Text. The original eight tools retain their source code. Camera access requires localhost or HTTPS and browser permission. Mobile users can also use Phone camera. Supported uploads: JPG, PNG, WebP, up to 10 pages / 15 MB each. Rotate sideways pages before scanning. Printed OCR runs locally; its worker and five language packs are bundled under public/ocr and served by your site.

## Browser-only recognition
There is no API key, backend or paid AI service. Photos are processed locally by Tesseract.js, using a WebAssembly OCR engine in a browser worker. Worker, WebAssembly engine, English/French/Spanish/Portuguese/German models and the PDF text worker are bundled with this project and loaded from your own site, without third-party OCR downloads. Opening the website still requires access to its host; this is not an installable offline PWA.

General handwriting is not reliably supported by this engine. Clear block lettering may work; cursive, faint writing, skewed pages, and unusual layouts can produce substantial errors. No mistake-free handwriting guarantee is possible. Users must compare and edit the extracted text before export.

## Review and export
No OCR engine guarantees mistake-free handwriting. Compare the source against the text, particularly names, amounts and punctuation. Multi-page scans preserve upload order. A successful scan replaces the review text; export your current edits before rescanning. Cancellation/failure preserves previous text.

Exports: real `.docx`, searchable `.pdf`, UTF-8 `.txt`, escaped `.html`. PDF uses Latin fonts; unsupported scripts trigger an explicit message to choose DOCX/TXT rather than exporting broken characters. Formatting, tables and original page layout are not reconstructed. Binary legacy `.doc`, spreadsheets and presentation formats are not supported exports.

PDF to Text works on selectable text, up to 30 MB / 200 pages. Scanned PDFs need PDF to Image followed by Scan to Document. Password-protected PDFs need an unlocked copy. Reading order in complex columns/tables needs review. The PDF worker version matches the installed PDF.js API.

## Verification
```sh
yarn test:ci
yarn build
```

Real device camera and handwriting quality require tests with your own device and documents. Automated tests do not establish real-world handwriting accuracy.

## Checks completed for this update
- Yarn 4.18.0 immutable installation succeeded.
- Production compilation succeeded (CRA reports a large bundle warning).
- Six automated tests passed (the test environment had an unbuilt optional native canvas dependency; it was excluded locally to let jsdom use its normal fallback, without changing project source/dependencies) for exports, Unicode handling, validation, review and camera errors.
- Real Tesseract recognition on a generated printed-text image correctly recovered both lines, including 12345 (engine confidence 93; this is not a universal accuracy estimate).
- Generated PDF was independently reopened and its text extracted; DOCX ZIP/XML contents were verified.
- All eight existing tool component files are byte-for-byte unchanged.
- Full interactive browser/device-camera checks could not run in this environment because a usable browser binary was unavailable. Handwriting accuracy has not been verified.
