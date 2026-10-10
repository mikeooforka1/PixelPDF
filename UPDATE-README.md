# PixelPDF: offline, dashboard and document tools update

## Apply the update

Extract the complete `PixelPDF-offline-and-tools-update.zip` into your existing project root, beside `package.json`. Replace the included frontend files, and include the new `scripts` folder. The ZIP also includes the compatible Python backend with an offline model-folder fix. Replace the included backend source files; keep your existing virtual environment, model cache and private environment files. Stop and restart Python after replacing its files.

No dependency was added: the Yarn lock is unchanged. PowerPoint export uses a locally bundled, licensed PptxGenJS browser library. The provided Tailwind/PostCSS configuration supports the included styles.

Run in the frontend project folder:

```powershell
yarn install --immutable
yarn test:ci
yarn test:offline
yarn build
```

`yarn build` now generates content hashes and a release identifier before building and stamps the worker from the actual compiled output afterward. Do not bypass its preparation script when deploying. Deploy the **complete build folder**, including `sw.js`, `pwa-assets.json`, OCR files, PDF resources, and PowerPoint support. Your host must serve assets as files, use an SPA fallback for app routes, and revalidate `sw.js`, `index.html`, `asset-manifest.json`, and `pwa-assets.json`. Hashed JavaScript/CSS files can be cached long-term. Serve the OCR `.traineddata.gz` files as raw gzip files; do not add a `Content-Encoding: gzip` header that makes the browser automatically decompress them before the OCR engine reads them. If using a same-origin Python proxy, route `/api/ocr` to Python before applying the SPA fallback.

On the currently installed app, reconnect and use its existing **Update available → Update and reload** control once to activate this update. Later releases use **Update ready → Restart to update**. Keep working delays the restart. The app does not silently reload or overwrite unsaved documents; export work before restarting. Browsers may activate a downloaded update once every app window has closed.

Offline mode must be tested against the production build, served on HTTPS or localhost. `yarn start` is the development server and does not register this production service worker. A local test can serve the build with an SPA-capable static server, for example `yarn dlx serve -s build` while online. Changing the domain, port, browser profile, or protocol creates a different storage origin and requires preparation there.

## Offline readiness and updates

- Startup checks actual saved files instead of starting a download after every refresh.
- OCR and PDF tool caches use content revisions, independently of app releases. Unchanged tools are reused.
- Existing downloads are validated and migrated without re-downloading them when their bytes match.
- Missing files are detected. Retry downloads only missing or changed files.
- Completed files survive an interrupted preparation attempt. Retry resumes from them.
- Updates download the app shell and, for users who already prepared offline use, changed tools in the background. The working release is preserved if the update fails.
- Updates are checked on startup, reconnection, foreground return, and every five minutes while open and online.
- Only public app files are cached. Uploaded documents and OCR API responses are not stored by the service worker.
- Offline tools need initial preparation from the app menu or after installation. Wait for **Offline ready**. The browser can still clear site storage; private browsing is not suitable for durable offline storage. Persistent storage is requested when preparing tools, but the browser decides whether to grant it.

## Does Python work offline?

Yes, once Python dependencies and the selected OCR models are downloaded. Keep the backend running. No API key is required.

| Where Python runs | What the user needs |
| --- | --- |
| On the same computer | Run the backend; internet is not needed after its models are downloaded. |
| On another computer in a local network | Reach that backend over the network, with compatible HTTPS/browser security and allowed origins. Internet itself is not necessary. |
| On an online-hosted server | Internet access is required to reach that server. |
| Only PixelPDF is installed on a phone | Python is not included in the web app. Use prepared browser OCR, or connect to an accessible backend. |

The frontend now checks whether Python is reachable even when the browser reports no internet. An unreachable offline backend falls back to browser OCR after a short health check. The backend now selects complete downloaded model folders explicitly, avoiding PaddleX’s model-name download resolver when offline. It retains the CPU profile and existing models. The bundled backend source is the compatible version from our preceding PaddleOCR update. Tests cover this connection/fallback logic using controlled server responses; actual PaddleOCR inference is not re-benchmarked here.

For local development, the frontend `.env.local` belongs beside `package.json`, not in `src`:

```env
REACT_APP_OCR_SERVER_URL=http://127.0.0.1:8000
```

Restart the frontend after changing that setting. For a deployed HTTPS app, use the actual HTTPS backend origin; a phone's `127.0.0.1` refers to the phone itself. In production, leaving the setting empty expects an OCR reverse proxy on the app's own origin. In the backend terminal, run `python warmup.py` once while online, then keep `python -m uvicorn main:app --host 127.0.0.1 --port 8000` running. Existing model downloads remain usable offline; choosing an uncached model/language needs a one-time download.

## Dashboard and tools

The root URL opens a dashboard with icons, descriptions, categories, and search. Choosing a card opens that tool's own URL. The PixelPDF logo returns home; browser back/forward navigation works. The scan page uses mobile-sized controls and explains browser/Python connection requirements.

New dedicated tools:

- **Split PDF:** selected page ranges to one PDF, or every page separately in a ZIP.
- **Organize PDF:** reorder, rotate and remove pages, keeping at least one page.
- **Compress PDF:** preserve text by rewriting the PDF, or create smaller JPEG-based pages. Image modes remove searchable text and interactive features. The original is kept if conversion would increase size.
- **Word to PDF:** `.docx` body text, basic headings, tables and common embedded images.
- **Excel to PDF:** `.xlsx` saved worksheet values, common date/percentage/number formats, and paginated tables. Wide sheets are split into column sections; formulas without cached results are shown as formulas. Formulas are not recalculated.
- **PowerPoint to PDF:** `.pptx` basic slide text, solid fills, and common images.
- **PDF to Word:** editable text through the existing stored-text/OCR review workflow, with DOCX export.
- **PDF to PowerPoint:** one page image per slide, fitted to a consistent slide size. Text/objects are not separately editable.

Office-to-PDF conversions run entirely in the browser and create image-based PDF pages. These converters support Latin-script text; other scripts receive an actionable error instead of a PDF containing missing-glyph boxes. Use Office’s native PDF export for those scripts. They are useful for common content, **not replacements for Microsoft Office's rendering engine**. Headers/footers, advanced typography, charts, grouped shapes, SmartArt, theme rendering, and complex Office layouts may differ or be omitted. These limitations are shown in each tool. Use Office's own PDF export when exact fidelity is essential. Legacy `.doc`, `.xls`, and `.ppt` files must first be saved as `.docx`, `.xlsx`, or `.pptx`.

Inputs are bounded at 50 MB; PDF conversion/editing and outputs are bounded at 200 pages. Office archive expansion is capped at 100 MB, XML parts at 20 MB, Excel data at 20,000 populated cells and 100 columns per sheet, and embedded image decoding at 25 million pixels. Protected/corrupt documents produce actionable errors; uploaded macros or document HTML are not executed. Review converted results before sharing.

## Validation

`yarn test:ci` covers imports, export, scan heuristics, Python reachability/fallback, page ranges, splitting, rotation/reordering, common spreadsheet number formats, and malformed XML. `yarn test:offline` exercises the real worker source with deterministic storage/network fixtures, including legacy migration, unchanged/changed tool updates, missing-file repair and failed-update preservation.

Real Chromium checks additionally exercise offline refresh, three applied updates, selective language repair, mobile widths, all original tool downloads, and all new conversions using actual generated Office/PDF fixtures. Downloaded PDFs, ZIPs, DOCX and PPTX outputs are inspected for page/slide counts and structure. Office rendering has the fidelity limits above; these tests do not promise pixel-perfect arbitrary Office documents or mistake-free handwriting.
