export function protectPdf(bytes, password, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const worker = new Worker(`${process.env.PUBLIC_URL || ''}/protect/protect-worker.js`);
    let finished = false;
    const done = (error, output) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker.terminate();
      if (error) reject(error); else resolve(output);
    };
    const cancel = () => done(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => done(new Error('Protection took too long. Try a smaller PDF.')), 120000);
    signal?.addEventListener('abort', cancel, {once:true});
    worker.onerror = () => done(new Error('The protection engine could not load. Reconnect and reload the app, then try again.'));
    worker.onmessage = ({data}) => data.error ? done(new Error(data.error)) : done(null, new Uint8Array(data.bytes));
    worker.postMessage({bytes,password}, [bytes]);
  });
}
