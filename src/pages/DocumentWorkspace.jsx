import React, { useEffect, useRef, useState } from 'react';
import { downloadDocument } from '../utils/documentExport';

// These helpers deliberately keep recognition local and avoid guessing missing words.
export function summarizeRecognition(data = {}) {
  const content = typeof data.text === 'string' ? data.text.trim() : '';
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
  const integral = adaptive ? new Uint32Array(stride * (height + 1)) : null;
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

const button = 'rounded-xl bg-violet-600 px-4 py-2 text-white font-semibold disabled:opacity-50';
export default function DocumentWorkspace({ kind = 'scan' }) {
  const [pages, setPages] = useState([]), [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [language, setLanguage] = useState('eng'), [format, setFormat] = useState('docx'), [name, setName] = useState('scanned-document'), [camera, setCamera] = useState(false), [quality, setQuality] = useState('accurate'), [layout, setLayout] = useState('printed'), [scanReview, setScanReview] = useState([]);
  const video = useRef(), stream = useRef(), worker = useRef(), generation = useRef(0), mounted = useRef(true), pagesRef = useRef([]), scanAbort = useRef(null), cameraRequest = useRef(0);
  const scan = kind === 'scan';
  function stopCamera() { cameraRequest.current++; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setCamera(false); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; cameraRequest.current++; scanAbort.current?.abort(); stream.current?.getTracks().forEach(t => t.stop()); releaseWorker(worker.current); pagesRef.current.forEach(p => URL.revokeObjectURL(p.url)); }; }, []);
  useEffect(() => { if (camera && video.current) video.current.srcObject = stream.current; }, [camera]);
  function updatePages(next) { pagesRef.current = next; setPages(next); }
  function addFiles(files) {
    if (busy || !mounted.current) return;
    setError(''); const next = [...pagesRef.current];
    for (const file of Array.from(files)) {
      if (!( ['image/jpeg','image/png','image/webp'].includes(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name)) )) { setError('Use JPG, PNG or WebP images.'); continue; }
      if (file.size > 15 * 1024 * 1024) { setError('Each image must be under 15 MB.'); continue; }
      if (next.length >= 10) { setError('Scan up to 10 pages at a time.'); break; }
      next.push({ file, url: URL.createObjectURL(file), rotation: 0 });
    }
    updatePages(next);
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
    await scanStep(() => img.decode(), signal, 20000);
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
  async function recognize() {
    if (!pages.length || busy) return;
    const token = ++generation.current, abort = new AbortController(); scanAbort.current = abort;
    const sourcePages = [...pages]; setBusy(true); setError(''); setScanReview([]);
    const results = [], review = []; let localWorker;
    const current = () => mounted.current && token === generation.current && !abort.signal.aborted;
    const check = () => { if (!current()) throw abortError(); };
    let pageNumber = 0, passName = 'Starting';
    try {
      const { createWorker } = await scanStep(() => import('tesseract.js'), abort.signal);
      const pendingWorker = createWorker(language, 1, {
        workerPath: `${process.env.PUBLIC_URL}/ocr/worker.min.js`, corePath: `${process.env.PUBLIC_URL}/ocr`, langPath: `${process.env.PUBLIC_URL}/ocr`, errorHandler: () => {},
        logger: message => { if (current()) setStatus(`${pageNumber ? `Page ${pageNumber}/${sourcePages.length} · ${passName} · ` : ''}${message.status} ${Math.round((message.progress || 0) * 100)}%`); }
      }).then(instance => { if (!current()) { releaseWorker(instance); throw abortError(); } return instance; });
      localWorker = await scanStep(() => pendingWorker, abort.signal); check(); worker.current = localWorker;
      for (let i = 0; i < sourcePages.length; i++) {
        check(); pageNumber = i + 1; passName = 'Preparing'; setStatus(`Preparing page ${pageNumber}/${sourcePages.length}…`);
        let image;
        try { image = await prepare(sourcePages[i], abort.signal); }
        catch (error) {
          if (error.name === 'AbortError') throw error;
          review.push({ page: pageNumber, confidence: 0, uncertain: [], failure: error.message || String(error) });
          results.push(`[Page ${pageNumber}: image could not be read — review the source]`); continue;
        }
        let best = null;
        async function read(input, psm, label) {
          check(); passName = label; setStatus(`Page ${pageNumber}/${sourcePages.length} · ${label}…`);
          await scanStep(() => localWorker.setParameters({ tessedit_pageseg_mode: psm, user_defined_dpi: '300', preserve_interword_spaces: '1' }), abort.signal);
          const { data } = await scanStep(() => localWorker.recognize(input, { rotateAuto: true }, { text: true, blocks: true }), abort.signal);
          check(); best = chooseRecognition(best, summarizeRecognition(data));
        }
        await read(image, layout === 'handwriting' ? '6' : '3', 'Original image');
        if (quality === 'accurate') {
          // Yield before pixel processing so Cancel/progress can paint on mobile.
          await scanStep(() => new Promise(resolve => setTimeout(resolve, 0)), abort.signal); check();
          const contrast = enhance(image, false);
          await read(contrast, '6', 'Contrast and text lines');
          if (!best || best.confidence < 90 || layout === 'handwriting') {
            await scanStep(() => new Promise(resolve => setTimeout(resolve, 0)), abort.signal); check();
            const adaptive = enhance(image, true); await read(adaptive, '6', 'Uneven lighting');
            adaptive.width = 1; adaptive.height = 1;
          }
          if (!best || best.confidence < 65) await read(contrast, '11', 'Scattered words');
          contrast.width = 1; contrast.height = 1;
        }
        image.width = 1; image.height = 1;
        if (!best?.text) {
          results.push(`[Page ${pageNumber}: no readable text — review the source]`);
          review.push({ page: pageNumber, confidence: 0, uncertain: [], failure: 'No readable text. Retake a clearer, upright photo.' });
        } else { results.push(best.text); review.push({ page: pageNumber, confidence: Math.round(best.confidence), uncertain: best.uncertain }); }
      }
      check();
      if (review.every(page => page.failure)) { setScanReview(review); throw new Error('No readable text found. Your previous text is preserved. Try a clearer image; cursive handwriting may not be recognized.'); }
      setText(results.join('\n\n')); setScanReview(review);
      const failures = review.filter(page => page.failure).length;
      setStatus(`Scan complete${failures ? ` · ${failures} page(s) need another photo` : ''}. Compare each page and the flagged words with the source before exporting.`);
    } catch (error) { if (current()) setError(error.message || String(error)); }
    finally {
      abort.abort(); releaseWorker(localWorker); if (worker.current === localWorker) worker.current = null;
      if (scanAbort.current === abort) scanAbort.current = null;
      if (mounted.current && token === generation.current) setBusy(false);
    }
  }
  async function extract(file) {
    if (!file) return; if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { setError('Select a PDF document.'); return; } if (file.size > 30*1024*1024) { setError('PDF must be under 30 MB.'); return; }
    const token = ++generation.current; setScanReview([]); setBusy(true); setError(''); let doc;
    try { const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/ocr/pdf.worker.min.js`;
      doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; if (doc.numPages > 200) throw new Error('Use a PDF with no more than 200 pages.'); const result = [];
      for (let i=1; i<=doc.numPages; i++) { if (token !== generation.current) return; setStatus(`Extracting page ${i} of ${doc.numPages}`); const page = await doc.getPage(i); const content = await page.getTextContent(); result.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim()); }
      if (mounted.current && token === generation.current) { const output = result.join('\n\n'); if (!output.trim()) throw new Error('This PDF has no selectable text. Export its pages with PDF to Image, then use Scan to Document.'); setText(output); setStatus('Text extracted. Review the reading order before exporting.'); }
    } catch(e) { if (mounted.current && token === generation.current) setError(e.name === 'PasswordException' ? 'This PDF is password protected. Upload an unlocked copy.' : e.message); }
    finally { await doc?.destroy(); if (mounted.current && token === generation.current) setBusy(false); }
  }
  async function download() { setError(''); try { await downloadDocument(text, format, name); } catch(e) { setError(e.message || String(e)); } }
  return <section className="mx-auto w-full min-w-0 max-w-6xl p-2 sm:p-6 space-y-5">
    <h2 className="text-3xl font-bold text-slate-900">{scan ? 'Scan to Document' : 'PDF to Text'}</h2>
    <p className="text-slate-600">{scan ? 'Photograph or upload a document, read its text, then export an editable document.' : 'Extract selectable PDF text and export it as Word, plain text, HTML or PDF.'}</p>
    {scan && <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Photos stay in your browser. Accurate mode compares multiple image and layout passes. Review the source and flagged words before exporting. Handwriting mode is best effort: cursive or unclear writing can still produce wrong or missing words.</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    <div className="grid min-w-0 gap-4 lg:gap-6 lg:grid-cols-2">
      <div className="min-w-0 rounded-2xl border bg-white p-3 sm:p-5 space-y-4">
        {scan ? <>
          <label className="block font-semibold">Add document photos<input aria-label="Document photos" className="block mt-2 min-w-0 max-w-full w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} /></label>
          <div className="flex gap-2 flex-wrap"><button className={button} disabled={busy || camera} onClick={openCamera}>Open camera</button><label className="rounded-xl border px-4 py-2 cursor-pointer">Phone camera<input aria-label="Phone camera" className="sr-only" type="file" accept="image/*" capture="environment" disabled={busy} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} /></label></div>
          {camera && <div><video ref={video} autoPlay playsInline muted className="w-full rounded-xl" /><div className="flex gap-2 mt-2"><button className={button} disabled={busy} onClick={capture}>Capture page</button><button className="border rounded-xl px-4" onClick={stopCamera}>Close camera</button></div></div>}
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">{pages.map((p,i) => <div key={p.url} className="border rounded-xl p-2 overflow-hidden"><img src={p.url} alt={`Document page ${i+1}`} className="h-40 w-full object-contain" style={{ transform:`rotate(${p.rotation}deg)` }} /><p>Page {i+1}</p><button disabled={busy} className="mr-3 underline" onClick={() => updatePages(pages.map((p,j) => j===i ? {...p,rotation:(p.rotation+90)%360} : p))}>Rotate</button><button disabled={busy} className="underline" onClick={() => { URL.revokeObjectURL(p.url); updatePages(pages.filter((_,j)=>j!==i)); }}>Remove</button></div>)}</div>
          <label className="block">Text language<select className="block border rounded-lg p-2 w-full" value={language} disabled={busy} onChange={e=>setLanguage(e.target.value)}>{[['eng','English'],['fra','French'],['spa','Spanish'],['por','Portuguese'],['deu','German']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><small>OCR models are served by this site. Keep the photo upright, flat and well lit.</small></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">Scan quality<select aria-label="Scan quality" className="block border rounded-lg p-2 w-full" value={quality} disabled={busy} onChange={event => setQuality(event.target.value)}><option value="accurate">Accurate · multiple passes</option><option value="fast">Fast · one pass</option></select></label>
            <label className="block">Document style<select aria-label="Document style" className="block border rounded-lg p-2 w-full" value={layout} disabled={busy} onChange={event => setLayout(event.target.value)}><option value="printed">Printed text / page layout</option><option value="handwriting">Handwriting / mixed · best effort</option></select></label>
          </div>
          <button className={button} disabled={busy || !pages.length} onClick={recognize}>Scan pages</button>
        </> : <label className="block font-semibold">Select PDF<input aria-label="Select PDF" className="block mt-2 min-w-0 max-w-full w-full text-sm" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e=>{ extract(e.target.files[0]); e.target.value=''; }} /></label>}
        {busy && <button className="ml-3 underline" onClick={cancel}>Cancel</button>}<p role="status" aria-live="polite" className="text-sm text-slate-600">{status}</p>
      </div>
      <div className="min-w-0 rounded-2xl border bg-white p-3 sm:p-5 space-y-4">
        {scanReview.length > 0 && <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm" aria-label="Scan review">
          <p className="font-semibold">Source review · OCR confidence is not an accuracy guarantee</p>
          {scanReview.map(page => <div key={page.page} className="break-words">
            <p className={page.failure || page.confidence < 75 ? 'text-amber-800' : 'text-slate-700'}>Page {page.page}: {page.failure || `${page.confidence}/100 engine confidence`}</p>
            {page.uncertain.length > 0 && <details><summary className="cursor-pointer text-amber-800">Review {page.uncertain.length} uncertain word(s)</summary><p className="mt-1">{page.uncertain.slice(0, 100).join(' · ')}{page.uncertain.length > 100 ? ' · More uncertain words: compare the whole page.' : ''}</p></details>}
          </div>)}
        </div>}
        <label className="block font-semibold">Review and edit text<textarea aria-label="Review and edit text" value={text} onChange={e=>setText(e.target.value)} disabled={busy} className="block mt-2 border rounded-xl p-3 w-full min-h-[360px]" placeholder="Recognized text will appear here. You can also type or paste text." /></label><p className="text-sm text-slate-500">{text.trim() ? text.trim().split(/\s+/).length : 0} words</p><label className="block">File name<input className="block border rounded-lg p-2 w-full" value={name} onChange={e=>setName(e.target.value)} /></label><label className="block">Export format<select aria-label="Export format" className="block border rounded-lg p-2 w-full" value={format} onChange={e=>setFormat(e.target.value)}><option value="docx">Word (.docx)</option><option value="pdf">Searchable PDF (.pdf)</option><option value="txt">Plain text (.txt)</option><option value="html">HTML document (.html)</option></select></label><button className={button} disabled={busy || !text.trim()} onClick={download}>Download document</button></div>
    </div>
  </section>;
}
