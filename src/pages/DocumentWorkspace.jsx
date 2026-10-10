import React, { useEffect, useRef, useState } from 'react';
import { scanWithPaddle } from '../utils/paddleOcr';
import { downloadDocument } from '../utils/documentExport';

// These helpers deliberately keep recognition local and avoid guessing missing words.
export function summarizeRecognition(data = {}) {
  const content = (typeof data.text === 'string' ? data.text.trim() : '') || (data.blocks || []).map(block => block.text || (block.paragraphs || []).map(paragraph => (paragraph.lines || []).map(line => line.text || (line.words || []).map(word => word.text || '').join(' ')).join('\n')).join('\n')).join('\n').trim();
  const words = (data.blocks || []).flatMap(block => (block.paragraphs || [])
    .flatMap(paragraph => (paragraph.lines || []).flatMap(line => line.words || [])));
  const uncertain = words.filter(word => Number(word.confidence) < 75 && word.text?.trim())
    .map(word => word.text.trim());
  return { text: content, confidence: Math.max(0, Math.min(100, Number(data.confidence) || 0)),
    uncertain: [...new Set(uncertain)], wordCount: content ? content.split(/\s+/).length : 0 };
}
export function chooseRecognition(current, candidate) {
  if (!candidate.text) return current;
  if (!current?.text) return candidate;
  // Confidence is a heuristic, never a promise of accuracy. Prefer coverage when
  // a layout pass loses most of a page, unless its confidence is much higher.
  const score = item => item.confidence - Math.min(25, item.uncertain.length * 2);
  if (candidate.wordCount < current.wordCount * 0.6 && candidate.confidence < current.confidence + 20) return current;
  if (current.wordCount < candidate.wordCount * 0.6 && candidate.confidence >= current.confidence - 8) return candidate;
  return score(candidate) > score(current) ? candidate : current;
}
export function enhancePixels(rgba, width, height, adaptive = false) {
  const count = width * height;
  const gray = new Uint8Array(count), histogram = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    const k = i * 4, alpha = rgba[k + 3] / 255;
    const value = Math.round((0.299 * rgba[k] + 0.587 * rgba[k + 1] + 0.114 * rgba[k + 2]) * alpha + 255 * (1 - alpha));
    gray[i] = value; histogram[value]++;
  }
  let low = 0, high = 255, sum = 0;
  for (let i = 0; i < 256; i++) { sum += histogram[i]; if (sum >= count * 0.01) { low = i; break; } }
  sum = 0;
  for (let i = 255; i >= 0; i--) { sum += histogram[i]; if (sum >= count * 0.01) { high = i; break; } }
  // Keep faint strokes instead of forcing low-contrast images to all black/white.
  const range = high - low; const output = new Uint8ClampedArray(count * 4);
  const stride = width + 1;
  const integral = adaptive ? new Float64Array(stride * (height + 1)) : null;
  if (integral) {
    for (let y = 1; y <= height; y++) {
      let row = 0;
      for (let x = 1; x <= width; x++) { row += gray[(y - 1) * width + x - 1]; integral[y * stride + x] = integral[(y - 1) * stride + x] + row; }
    }
  }
  const radius = Math.max(12, Math.min(48, Math.round(Math.min(width, height) / 45)));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    let value = range > 25 ? (gray[i] - low) * 255 / range : gray[i];
    if (integral) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1);
      const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1);
      const mean = (integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
      value = gray[i] < mean - 9 ? 0 : 255;
    }
    const k = i * 4; output[k] = value; output[k + 1] = value; output[k + 2] = value; output[k + 3] = 255;
  }
  return output;
}
function abortError() { const error = new Error('Scan cancelled.'); error.name = 'AbortError'; return error; }
function scanStep(action, signal, timeout = 90000) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); };
    const onAbort = () => { cleanup(); reject(abortError()); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('The scan took too long. Try fewer pages or a smaller image.')); }, timeout);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(action).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
function releaseWorker(instance) { try { instance?.terminate().catch(() => {}); } catch { /* Already stopped. */ } }

const button = 'min-h-[44px] rounded-xl bg-violet-600 px-4 py-2 text-white font-semibold focus-visible:ring-4 focus-visible:ring-violet-200 disabled:opacity-50';
const selectClass = 'mt-2 block min-h-[44px] w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:bg-slate-50';
export default function DocumentWorkspace({ kind = 'scan' }) {
  const [pages, setPages] = useState([]), [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [language, setLanguage] = useState('eng'), [format, setFormat] = useState('docx'), [name, setName] = useState('scanned-document'), [camera, setCamera] = useState(false), [quality, setQuality] = useState('accurate'), [layout, setLayout] = useState('printed'), [scanReview, setScanReview] = useState([]);
  const video = useRef(), stream = useRef(), worker = useRef(), generation = useRef(0), mounted = useRef(true), pagesRef = useRef([]), scanAbort = useRef(null), cameraRequest = useRef(0);
  const [engine, setEngine] = useState('browser');
  const scan = kind === 'scan';
  function stopCamera() { cameraRequest.current++; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCamera(false); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; cameraRequest.current++; scanAbort.current?.abort(); stream.current?.getTracks().forEach(t => t.stop()); releaseWorker(worker.current); pagesRef.current.forEach(p => URL.revokeObjectURL(p.url)); }; }, []);
  useEffect(() => { if (camera && video.current) video.current.srcObject = stream.current; }, [camera]);
  function updatePages(next) { pagesRef.current = next; setPages(next); }
  async function addFiles(files, replace = false) {
    if (busy || !mounted.current) return;
    const token = ++generation.current, abort = new AbortController(); scanAbort.current = abort;
    setBusy(true); setError(''); const next = replace ? [] : [...pagesRef.current], added = [], issues = [];
    const check = () => { if (!mounted.current || token !== generation.current || abort.signal.aborted) throw abortError(); };
    const push = page => { check(); if (next.length >= 200) throw new Error('Process up to 200 pages at a time. Remove completed pages before adding more.'); next.push(page); added.push(page); };
    try {
      for (const file of Array.from(files)) {
        check(); setStatus(`Opening ${file.name}…`);
        try {
          if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name}: use a file under 50 MB.`);
          const extension = file.name.split('.').pop().toLowerCase();
          if (extension === 'pdf' || file.type === 'application/pdf') {
            const pdfjs = await import('pdfjs-dist'); check(); pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/ocr/pdf.worker.min.js`;
            const task = pdfjs.getDocument({ data: await file.arrayBuffer(), cMapUrl: `${process.env.PUBLIC_URL}/pdf-assets/cmaps/`, cMapPacked: true, standardFontDataUrl: `${process.env.PUBLIC_URL}/pdf-assets/standard_fonts/` });
            const onAbort = () => { task.destroy().catch(() => {}); }; abort.signal.addEventListener('abort', onAbort, { once: true });
            let doc;
            try {
              doc = await scanStep(() => task.promise, abort.signal); check();
              for (let i = 1; i <= doc.numPages; i++) {
                check(); if (next.length >= 200) throw new Error(`${file.name}: first pages added. Process these before adding remaining pages; maximum 200 queued pages.`);
                setStatus(`Opening ${file.name} · page ${i}/${doc.numPages}`);
                const page = await scanStep(() => doc.getPage(i), abort.signal);
                let content; try { content = await scanStep(() => page.getTextContent(), abort.signal); } catch (error) { if (error.name === 'AbortError') throw error; }
                const value = content?.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim();
                if (value) push({ text: value, label: `${file.name} · page ${i}`, id: `${token}-${next.length}`, rotation: 0 });
                else {
                  const original = page.getViewport({ scale: 1 }); const scale = Math.min(3, 3200 / Math.max(original.width, original.height), Math.sqrt(5000000 / (original.width * original.height)));
                  const viewport = page.getViewport({ scale }), canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
                  const render = page.render({ canvasContext: canvas.getContext('2d'), viewport });
                  const cancelRender = () => render.cancel(); abort.signal.addEventListener('abort', cancelRender, { once: true });
                  try { await scanStep(() => render.promise, abort.signal); } finally { abort.signal.removeEventListener('abort', cancelRender); }
                  const blob = await scanStep(() => new Promise(resolve => canvas.toBlob(resolve, 'image/png')), abort.signal); canvas.width = 1; canvas.height = 1; check();
                  if (!blob) throw new Error('The browser could not render this PDF page.');
                  push({ file: blob, url: URL.createObjectURL(blob), rotation: 0, label: `${file.name} · page ${i}` });
                }
                page.cleanup();
              }
            } finally { abort.signal.removeEventListener('abort', onAbort); await task.destroy().catch(() => {}); }
          } else if (['txt','csv','md','html','htm','docx'].includes(extension) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.type.startsWith('text/')) {
            let value;
            if (extension === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
              const { default: JSZip } = await import('jszip'); const archive = await scanStep(() => JSZip.loadAsync(file), abort.signal);
              const entry = archive.file('word/document.xml'); if (!entry) throw new Error('This is not a valid Word DOCX file.');
              if (entry._data?.uncompressedSize > 20 * 1024 * 1024) throw new Error('The expanded Word document is too large.');
              const xml = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
              if (xml.getElementsByTagName('parsererror').length) throw new Error('The Word document is damaged.');
              value = Array.from(xml.getElementsByTagNameNS('*', 'p')).map(p => Array.from(p.getElementsByTagNameNS('*', 't')).map(t => t.textContent).join('')).join('\n');
            } else {
              const bytes = new Uint8Array(await file.arrayBuffer());
              const encoding = bytes[0] === 255 && bytes[1] === 254 ? 'utf-16le' : bytes[0] === 254 && bytes[1] === 255 ? 'utf-16be' : 'utf-8';
              value = new TextDecoder(encoding).decode(bytes);
              if (['html','htm'].includes(extension) || file.type === 'text/html') { const html = new DOMParser().parseFromString(value, 'text/html'); html.querySelectorAll('script,style,template').forEach(node => node.remove()); html.querySelectorAll('br,p,div,li,tr,h1,h2,h3').forEach(node => node.appendChild(html.createTextNode('\n'))); value = html.body.textContent; }
            }
            if (!value.trim()) throw new Error(`${file.name}: no stored text found. For an image-only Word document, export it as PDF and upload that PDF.`);
            push({ text: value.trim(), label: file.name, id: `${token}-${next.length}`, rotation: 0 });
          } else if (file.type.startsWith('image/') || /^(jpe?g|png|webp|bmp|gif|avif|svg|heic|heif|tiff?)$/.test(extension)) {
            push({ file, url: URL.createObjectURL(file), rotation: 0, label: file.name });
          } else throw new Error(`${file.name}: unsupported format. Use a photo, PDF, DOCX, TXT, CSV, Markdown or HTML. Convert legacy DOC files to DOCX or PDF.`);
        } catch (error) { if (error.name === 'AbortError' || abort.signal.aborted) throw abortError(); issues.push(error.name === 'PasswordException' ? `${file.name}: upload an unlocked PDF.` : error.message || String(error)); }
      }
      check(); if (replace) pagesRef.current.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); }); updatePages(next); setError(issues.join(' ')); setStatus(`${added.length} page(s) added. Select Scan pages to read them.`); return next;
    } catch (error) { added.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); }); if (mounted.current && token === generation.current) setError(error.message); }
    finally { if (scanAbort.current === abort) scanAbort.current = null; if (mounted.current && token === generation.current) setBusy(false); }
  }
  async function openCamera() {
    setError(''); const token = ++cameraRequest.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera needs HTTPS or localhost. You can also upload a photo.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
      if (!mounted.current || token !== cameraRequest.current) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = media; setCamera(true);
    } catch (e) { if (mounted.current && token === cameraRequest.current) setError(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow access or upload a photo.' : e.message); }
  }
  function capture() {
    const v = video.current; if (!v?.videoWidth) { setError('Wait for the camera preview.'); return; }
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0); c.toBlob(blob => { if (blob && mounted.current) addFiles([new File([blob], 'camera.jpg', { type: 'image/jpeg' })]); }, 'image/jpeg', .95);
  }
  async function prepare(page, signal) {
    const img = new Image(); img.src = page.url;
    try { await scanStep(() => img.decode(), signal, 20000); } catch (error) { if (error.name === 'AbortError') throw error; throw new Error('This browser could not decode the photo. Convert HEIC or TIFF to JPG/PNG, or upload a readable PDF.'); }
    if (!img.width || !img.height || img.width * img.height > 80000000) throw new Error('This photo is too large to decode safely. Resize it and try again.');
    const longest = Math.max(img.width, img.height);
    const scale = Math.min(longest < 1600 ? Math.min(2, 1600 / longest) : 1, 3200 / longest, Math.sqrt(5000000 / (img.width * img.height)));
    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas'), sideways = page.rotation % 180 !== 0;
    canvas.width = (sideways ? h : w) + 40; canvas.height = (sideways ? w : h) + 40;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This browser cannot process photos. Try an updated browser.');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(page.rotation * Math.PI / 180);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, -w / 2, -h / 2, w, h);
    return canvas;
  }
  function enhance(canvas, adaptive) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = document.createElement('canvas'); result.width = canvas.width; result.height = canvas.height;
    const target = result.getContext('2d'); const processed = target.createImageData(result.width, result.height);
    processed.data.set(enhancePixels(pixels.data, result.width, result.height, adaptive)); target.putImageData(processed, 0, 0);
    return result;
  }
  function cancel() {
    generation.current++; scanAbort.current?.abort(); releaseWorker(worker.current); worker.current = null;
    setBusy(false); setStatus('Cancelled. Your previous text is preserved.');
  }
  async function recognize(inputPages = pages) {
    if (!Array.isArray(inputPages)) inputPages = pages;
    if (!inputPages.length || busy) return;
    const token = ++generation.current, abort = new AbortController(); scanAbort.current = abort;
    const sourcePages = [...inputPages]; setBusy(true); setError(''); setScanReview([]);
    const results = [], review = []; let localWorker;
    const current = () => mounted.current && token === generation.current && !abort.signal.aborted;
    const check = () => { if (!current()) throw abortError(); };
    let pageNumber = 0, passName = 'Starting';
    try {
      async function ensureWorker() {
      if (localWorker) return;
      const { createWorker } = await scanStep(() => import('tesseract.js'), abort.signal);
      const pendingWorker = createWorker(language, 1, {
        workerPath: `${process.env.PUBLIC_URL}/ocr/worker.min.js`, corePath: `${process.env.PUBLIC_URL}/ocr`, langPath: `${process.env.PUBLIC_URL}/ocr`, errorHandler: () => {},
        logger: message => { if (current()) setStatus(`${pageNumber ? `Page ${pageNumber}/${sourcePages.length} · ${passName} · ` : ''}${message.status} ${Math.round((message.progress || 0) * 100)}%`); }
      }).then(instance => { if (!current()) { releaseWorker(instance); throw abortError(); } return instance; });
      localWorker = await scanStep(() => pendingWorker, abort.signal); check(); worker.current = localWorker;
      }
      for (let i = 0; i < sourcePages.length; i++) {
        check(); pageNumber = i + 1; passName = 'Preparing'; setStatus(`Preparing page ${pageNumber}/${sourcePages.length}…`);
        if (sourcePages[i].text) { results.push(sourcePages[i].text); review.push({ page: pageNumber, confidence: 100, uncertain: [], direct: true }); continue; }
        let serverWarning = '';
        let image;
        try { image = await prepare(sourcePages[i], abort.signal); }
        catch (error) {
          if (error.name === 'AbortError') throw error;
          review.push({ page: pageNumber, confidence: 0, uncertain: [], failure: error.message || String(error) });
          results.push(`[Page ${pageNumber}: image could not be read — review the source]`); continue;
        }
        if (engine === 'paddle') {
          {
            try {
              setStatus(`Page ${pageNumber}/${sourcePages.length} · PaddleOCR server scanning… First use may load models.`);
              const serverAbort = new AbortController(); const forwardAbort = () => serverAbort.abort();
              abort.signal.addEventListener('abort', forwardAbort, { once: true });
              let result;
              try { result = await scanStep(() => scanWithPaddle(image, language, serverAbort.signal, progress => {
                if (!serverAbort.signal.aborted) setStatus(`Page ${pageNumber}/${sourcePages.length} · PaddleOCR ${progress.status === 'processing' ? 'reading text' : 'loading models'}… ${progress.elapsed}s elapsed`);
              }), abort.signal, 270000); }
              finally { serverAbort.abort(); abort.signal.removeEventListener('abort', forwardAbort); }
              check();
              if (result.text) { results.push(result.text); review.push({page:pageNumber, confidence:Math.round(result.confidence), uncertain:result.uncertain, engine:result.engine}); image.width = 1; image.height = 1; continue; }
              serverWarning = 'PaddleOCR returned no text; browser scanning was also tried.';
            } catch (error) { if (error.name === 'AbortError') throw error; serverWarning = `PaddleOCR unavailable: ${error.message || 'connection failed'}. Browser scanning was used.`; }
          }
        }
        await ensureWorker();
        let best = null; const readings = [];
        async function read(input, psm, label) {
          check(); passName = label; setStatus(`Page ${pageNumber}/${sourcePages.length} · ${label}…`);
          await scanStep(() => localWorker.setParameters({ tessedit_pageseg_mode: psm, user_defined_dpi: '300', preserve_interword_spaces: '1' }), abort.signal);
          const { data } = await scanStep(() => localWorker.recognize(input, { rotateAuto: true }, { text: true, blocks: true }), abort.signal);
          check(); const candidate = summarizeRecognition(data); if (candidate.text && !readings.some(reading => reading.text === candidate.text)) readings.push(candidate); best = chooseRecognition(best, candidate);
        }
        let passFailure = '';
        try {
        await read(image, layout === 'handwriting' ? '6' : '3', 'Original image');
        if (quality === 'accurate') {
          // Yield before pixel processing so Cancel/progress can paint on mobile.
          await scanStep(() => new Promise(resolve => setTimeout(resolve, 0)), abort.signal); check();
          const contrast = enhance(image, false);
          await read(contrast, '6', 'Contrast and text lines');
          if (layout === 'handwriting') await read(image, '11', 'Handwriting coverage');
          if (!best || best.confidence < 90 || layout === 'handwriting') {
            await scanStep(() => new Promise(resolve => setTimeout(resolve, 0)), abort.signal); check();
            const adaptive = enhance(image, true); await read(adaptive, '6', 'Uneven lighting');
            adaptive.width = 1; adaptive.height = 1;
          }
          if (!best || best.confidence < 65) { await read(image, '11', 'Original scattered words'); await read(contrast, '11', 'Scattered words'); }
          contrast.width = 1; contrast.height = 1;
        }
        } catch (error) { if (error.name === 'AbortError') throw error; passFailure = error.message || String(error); releaseWorker(localWorker); if (worker.current === localWorker) worker.current = null; localWorker = null; }
        image.width = 1; image.height = 1;
        if (!best?.text) {
          results.push(`[Page ${pageNumber}: no readable text — review the source]`);
          review.push({ page: pageNumber, confidence: 0, uncertain: [], failure: passFailure || 'No readable text. Retake a clearer, upright photo.' });
        } else { results.push(best.text); review.push({ page: pageNumber, confidence: Math.round(best.confidence), uncertain: best.uncertain, alternatives: readings.filter(reading => reading.text !== best.text), engine: 'Browser OCR', warning: [serverWarning, passFailure ? 'One scan pass failed; the recovered text was kept.' : ''].filter(Boolean).join(' ') }); }
      }
      check();
      if (review.every(page => page.failure)) { setScanReview(review); throw new Error('No readable text found. Your previous text is preserved. Try a clearer image; cursive handwriting may not be recognized.'); }
      setText(results.join('\n\n')); setScanReview(review);
      const failures = review.filter(page => page.failure).length;
      setStatus(`Scan complete${failures ? ` · ${failures} page(s) need another photo` : ''}. Compare each page and the flagged words with the source before exporting.`);
    } catch (error) { if (current()) { if (review.some(page => !page.failure)) { setText(results.join('\n\n')); setScanReview(review); } setError(error.message || String(error)); } }
    finally {
      abort.abort(); releaseWorker(localWorker); if (worker.current === localWorker) worker.current = null;
      if (scanAbort.current === abort) scanAbort.current = null;
      if (mounted.current && token === generation.current) setBusy(false);
    }
  }
  async function extract(file) {
    if (!file || busy) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { setError('Select a PDF document.'); return; }
    // Reuse the same local pipeline: stored PDF text first, OCR for image-only pages.
    const next = await addFiles([file], true); if (next?.length && mounted.current) await recognize(next);
  }
  async function download() { setError(''); try { await downloadDocument(text, format, name); } catch(e) { setError(e.message || String(e)); } }
  return <section className="mx-auto w-full min-w-0 max-w-6xl p-2 sm:p-6 space-y-5">
    <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">{scan ? 'Scan to Document' : kind === 'word' ? 'PDF to Word' : 'PDF to Text'}</h2>
    <p className="text-slate-600">{scan ? 'Photograph or upload a document, read its text, then export an editable document.' : kind === 'word' ? 'Extract text or scan PDF pages, review the words, and download an editable Word document. Complex layouts and images are not reconstructed.' : 'Extract PDF text, scan image-only pages automatically, and export it as Word, plain text, HTML or PDF.'}</p>
    {scan && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Choose a scanning method, add your pages, then review the text before downloading. PDFs, Word documents and text files use stored text when available. Photos and image-only pages need scanning. Clear, upright photos give better results; handwriting may still contain mistakes.</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    <div className="grid min-w-0 gap-4 lg:gap-6 lg:grid-cols-2">
      <div className="min-w-0 rounded-2xl border bg-white p-3 sm:p-5 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">1. Choose your scanning method</h3>
        <label className="block font-semibold">Scanning method<select aria-label="Scanning engine" aria-describedby="scan-engine-help" className={selectClass} value={engine} disabled={busy} onChange={event => setEngine(event.target.value)}><option value="browser">Browser · on this device</option><option value="paddle">Python · connected backend</option></select></label>
        {engine === 'browser' && <p id="scan-engine-help" className="text-sm leading-relaxed text-slate-600">Keeps your pages on this device. Works without internet after you prepare the browser tools in the app menu.</p>}
        {engine === 'paddle' && <div id="scan-engine-help" className="rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-900"><p className="font-semibold">Python sends page images to your connected backend.</p><ul className="mt-3 list-disc space-y-2 pl-5"><li><strong>Online backend:</strong> internet access is required.</li><li><strong>This computer:</strong> keep Python running. Downloaded models work without internet.</li><li><strong>Phone:</strong> reach an online or accessible local-network backend. Installing PixelPDF does not install Python.</li></ul><p className="mt-3">If Python cannot be reached, prepared browser OCR takes over. Always review the returned text.</p></div>}
        {scan ? <>
          <h3 className="text-lg font-bold text-slate-900">2. Add pages to scan</h3>
          <label className="block font-semibold">Upload photos, PDF, Word or text<input aria-label="Document photos" className="block mt-2 min-w-0 max-w-full w-full text-sm" type="file" accept="image/*,.pdf,.docx,.txt,.csv,.md,.html,.htm" multiple disabled={busy} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} /></label>
          <div className="flex gap-2 flex-wrap"><button className={button} disabled={busy || camera} onClick={openCamera}>Open camera</button><label className="rounded-xl border px-4 py-2 cursor-pointer">Phone camera<input aria-label="Phone camera" className="sr-only" type="file" accept="image/*" capture="environment" disabled={busy} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} /></label></div>
          {camera && <div><video ref={video} autoPlay playsInline muted className="w-full rounded-xl" /><div className="flex flex-wrap gap-2 mt-2"><button className={button} disabled={busy} onClick={capture}>Capture page</button><button className="border rounded-xl px-4" onClick={stopCamera}>Close camera</button></div></div>}
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">{pages.map((p,i) => <div key={p.url || p.id} className="border rounded-xl p-2 overflow-hidden">{p.url ? <img src={p.url} alt={`Document page ${i+1}`} className="h-40 w-full object-contain" style={{ transform:`rotate(${p.rotation}deg)` }} /> : <div className="h-40 overflow-auto whitespace-pre-wrap break-words text-xs p-2">{p.text}</div>}<p className="break-words">Page {i+1} · {p.label}</p><button disabled={busy || !p.url} className="mr-3 underline" onClick={() => updatePages(pages.map((p,j) => j===i ? {...p,rotation:(p.rotation+90)%360} : p))}>Rotate</button><button disabled={busy} className="underline" onClick={() => { if (p.url) URL.revokeObjectURL(p.url); updatePages(pages.filter((_,j)=>j!==i)); }}>Remove</button></div>)}</div>
          <label className="block font-semibold">Document language<select aria-label="Text language" aria-describedby="scan-language-help" className={selectClass} value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}>{[['eng','English'],['fra','French'],['spa','Spanish'],['por','Portuguese'],['deu','German']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><small id="scan-language-help" className="mt-2 block font-normal leading-relaxed text-slate-500">Choose the language written on your pages, rather than your phone’s language.</small></label>
          {engine === 'browser' && <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="block">Scan quality<select aria-label="Scan quality" aria-describedby="scan-quality-help" className={selectClass} value={quality} disabled={busy} onChange={event => setQuality(event.target.value)}><option value="accurate">Thorough · more passes</option><option value="fast">Quick · one pass</option></select><small id="scan-quality-help" className="mt-2 block leading-relaxed text-slate-500">Thorough compares readings and takes longer. Quick is useful for clear printed pages.</small></label>
            <label className="block">Writing style<select aria-label="Document style" aria-describedby="scan-style-help" className={selectClass} value={layout} disabled={busy} onChange={event => setLayout(event.target.value)}><option value="printed">Printed text</option><option value="handwriting">Handwriting or mixed</option></select><small id="scan-style-help" className="mt-2 block leading-relaxed text-slate-500">Handwriting uses extra browser reading passes. Always check handwritten words against the source.</small></label>
          </div>}
          {engine === 'paddle' && <p className="text-sm text-slate-500">Python uses the backend’s scan settings. Browser quality and writing-style settings apply only if browser scanning is selected.</p>}
          <button className={`${button} w-full sm:w-auto`} disabled={busy || !pages.length} onClick={recognize}>Scan pages</button>
        </> : <label className="block font-semibold">Select PDF<input aria-label="Select PDF" className="block mt-2 min-w-0 max-w-full w-full text-sm" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>{ extract(e.target.files[0]); e.target.value=''; }} /></label>}
        {busy && <button className="ml-3 underline" onClick={cancel}>Cancel</button>}<p role="status" aria-live="polite" className="break-words text-sm text-slate-600">{status}</p>
      </div>
      <div className="min-w-0 rounded-2xl border bg-white p-3 sm:p-5 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">{scan ? '3. Review and download' : 'Review and download'}</h3>
        {scanReview.length > 0 && <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm" aria-label="Scan review">
          <p className="font-semibold">Source review · OCR confidence is not an accuracy guarantee</p>
          {scanReview.map(page => <div key={page.page} className="break-words">
            <p className={page.failure || page.confidence < 75 ? 'text-amber-800' : 'text-slate-700'}>Page {page.page}: {page.failure || (page.direct ? 'Stored document text imported directly' : `${page.engine ? `${page.engine} · ` : ''}${page.confidence}/100 engine confidence`)}</p>
            {page.alternatives?.length > 0 && <details><summary className="cursor-pointer text-violet-700">Compare {page.alternatives.length} alternate reading(s)</summary><p className="mt-2 text-xs text-slate-600">Other passes may recover missing words. Compare them with the source and copy verified text into your edited document.</p>{page.alternatives.map((reading, index) => <div key={index} className="mt-2"><p className="text-xs">Alternative {index + 1} · {Math.round(reading.confidence)}/100 engine confidence</p><textarea aria-label={`Page ${page.page} alternative ${index + 1}`} readOnly value={reading.text} className="mt-1 min-h-24 w-full rounded-lg border bg-white p-2" /></div>)}</details>}
            {page.warning && <p className="text-amber-800">{page.warning}</p>}
            {page.uncertain.length > 0 && <details><summary className="cursor-pointer text-amber-800">Review {page.uncertain.length} uncertain word(s)</summary><p className="mt-1">{page.uncertain.slice(0, 100).join(' · ')}{page.uncertain.length > 100 ? ' · More uncertain words: compare the whole page.' : ''}</p></details>}
          </div>)}
        </div>}
        <label className="block font-semibold">Review and edit text<textarea aria-label="Review and edit text" value={text} onChange={e=>setText(e.target.value)} disabled={busy} className="block mt-2 min-w-0 border rounded-xl p-3 text-base w-full min-h-[260px] sm:min-h-[360px]" placeholder="Recognized text will appear here. You can also type or paste text." /></label><p className="text-sm text-slate-500">{text.trim() ? text.trim().split(/\s+/).length : 0} words</p><label className="block">File name<input className={selectClass} value={name} onChange={e=>setName(e.target.value)} /></label><label className="block">Export format<select aria-label="Export format" className={selectClass} value={format} onChange={e=>setFormat(e.target.value)}><option value="docx">Word (.docx)</option><option value="pdf">Searchable PDF (.pdf)</option><option value="txt">Plain text (.txt)</option><option value="html">HTML document (.html)</option></select></label><button className={button} disabled={busy || !text.trim()} onClick={download}>Download document</button></div>
    </div>
  </section>;
}
