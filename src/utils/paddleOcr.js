export function paddleEndpoint() {
  const configured = (process.env.REACT_APP_OCR_SERVER_URL || '').trim().replace(/\/$/, '');
  const local = ['localhost','127.0.0.1','[::1]'].includes(window.location.hostname);
  const base = configured || (local ? 'http://127.0.0.1:8000' : '');
  const url = new URL(`${base}/api/ocr`, window.location.origin);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('The OCR server address must use HTTP or HTTPS.');
  if (window.location.protocol === 'https:' && url.protocol !== 'https:') throw new Error('The deployed OCR server needs HTTPS.');
  return url.href;
}
export async function scanWithPaddle(canvas, language, signal, onProgress) {
  if (!navigator.onLine) {
    // No internet does not imply localhost or a LAN Python server is unavailable.
    const probe = new AbortController();
    const cancel = () => probe.abort();
    signal.addEventListener('abort', cancel, {once:true});
    const timeout = setTimeout(cancel, 3000);
    try {
      if (signal.aborted) {cancel(); throw new Error('cancelled');}
      const health = await fetch(`${paddleEndpoint()}/health`, {signal:probe.signal,credentials:'omit',cache:'no-store'});
      if (!health.ok) throw new Error('unavailable');
    } catch {
      if (signal.aborted) {const error=new Error('Scan cancelled.');error.name='AbortError';throw error;}
      throw new Error('Offline: the Python backend could not be reached. Keep it running on this computer or connect to its local network');
    } finally {clearTimeout(timeout);signal.removeEventListener('abort',cancel);}
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (signal.aborted) { const error = new Error('Scan cancelled.'); error.name = 'AbortError'; throw error; }
  if (!blob) throw new Error('This page could not be prepared for server scanning.');
  const body = new FormData(); body.append('file', blob, 'page.png'); body.append('language', language);
  const endpoint = paddleEndpoint();
  const started = Date.now();
  let pending = false; let finished = false; let probe;
  const report = async () => {
    if (pending || signal.aborted || !onProgress) return;
    pending = true; probe = new AbortController();
    const cancel = () => probe.abort();
    signal.addEventListener('abort', cancel, {once:true});
    const timeout = setTimeout(cancel, 2000);
    try {
      const health = await fetch(`${endpoint}/health`, {signal:probe.signal, credentials:'omit', cache:'no-store'});
      if (health.ok) {
        const state = await health.json();
        if (!finished && !signal.aborted) onProgress({status:state.status, elapsed:Math.floor((Date.now()-started)/1000)});
      }
    } catch { /* A health probe must never interrupt recognition. */ }
    finally { clearTimeout(timeout); signal.removeEventListener('abort', cancel); pending = false; }
  };
  const timer = onProgress ? setInterval(report, 2000) : null;
  let response;
  try { response = await fetch(endpoint, { method:'POST', body, signal, credentials:'omit', cache:'no-store' }); }
  finally { finished = true; clearInterval(timer); if (probe) probe.abort(); }
  let data; try { data = await response.json(); } catch { throw new Error('The PaddleOCR server returned an invalid response. Check its deployment.'); }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'The PaddleOCR server could not scan this page.');
  if (typeof data.text !== 'string' || !Number.isFinite(data.confidence) || !Array.isArray(data.uncertain) || data.uncertain.some(word => typeof word !== 'string')) throw new Error('The PaddleOCR server returned an invalid scan result.');
  return {text:data.text.trim(), confidence:Math.max(0,Math.min(100,data.confidence)), uncertain:data.uncertain, engine:'PaddleOCR PP-OCRv5'};
}
