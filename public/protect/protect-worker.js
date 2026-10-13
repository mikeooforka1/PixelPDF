/* qpdf 0.3.0 browser wrapper; files and passwords stay in this worker. */
importScripts('qpdf.js');
self.onmessage = async ({data}) => {
  try {
    const engine = await Module({locateFile: () => new URL('qpdf.wasm', self.location.href).href, print: () => {}, printErr: () => {}});
    engine.FS.writeFile('/input.pdf', new Uint8Array(data.bytes));
    const owner = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    const code = engine.callMain(['--encrypt', data.password, owner, '256', '--', '/input.pdf', '/protected.pdf']);
    if (code !== 0 && code !== 3) throw new Error('encryption');
    const output = engine.FS.readFile('/protected.pdf');
    const bytes = output.slice().buffer;
    self.postMessage({bytes}, [bytes]);
  } catch {
    self.postMessage({error: 'Could not protect this PDF. It may be damaged, already encrypted, or too large for this device. Try an unprotected, smaller PDF.'});
  }
};
