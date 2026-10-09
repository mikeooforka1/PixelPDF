/* PixelPDF: versioned app-shell caching. Never caches uploaded documents. */
importScripts(new URL('pwa-libs/jszip.min.js', self.location.href).href);
const BASE = new URL(self.registration.scope);
const BUILD = new URL(self.location.href).searchParams.get('build') || 'v1';
const PREFIX = `pixelpdf-${BASE.pathname.replace(/[^a-z0-9]/gi, '_')}-`;
const VERSION = BUILD.replace(/[^a-z0-9._-]/gi, '_');
const SHELL = `${PREFIX}${VERSION}-shell`;
const OFFLINE = `${PREFIX}${VERSION}-offline`;
const READY = new URL('__pixelpdf_offline_ready__', BASE).href;
let preparing = null;
const local = path => new URL(path, BASE).href;
async function getResponse(url, onBytes) {
  const controller = new AbortController();
  let timer;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), 30000); };
  arm();
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok || response.type === 'opaque' || response.headers.get('Content-Type')?.includes('text/html') && !url.endsWith('index.html')) throw new Error(`Missing app file: ${new URL(url).pathname.split('/').pop()}`);
    const reader = response.body?.getReader(); const chunks = []; let bytes = 0;
    if (reader) {
      while (true) { const item = await reader.read(); if (item.done) break; arm(); chunks.push(item.value); bytes += item.value.byteLength; onBytes?.(bytes); }
    } else { const blob = await response.blob(); chunks.push(blob); bytes = blob.size; onBytes?.(bytes); }
    const headers = new Headers(response.headers); headers.delete('Content-Encoding'); headers.delete('Content-Length');
    return new Response(new Blob(chunks), { status: response.status, headers });
  } finally { clearTimeout(timer); }
}
async function report(data) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const window of windows) window.postMessage({ channel: 'pixelpdf-offline', ...data });
}
async function assetLists() {
  const response = await getResponse(local('pwa-assets.json'));
  const assets = await response.json();
  if (!Array.isArray(assets.core) || !Array.isArray(assets.offline)) throw new Error('Invalid offline asset list.');
  return assets;
}
async function fill(cacheName, paths, progress) {
  const cache = await caches.open(cacheName); let done = 0, index = 0;
  const urls = [...new Set(paths.map(path => local(path)))];
  const totals = new Map(); let last = 0;
  const notify = (force = false, file = '') => {
    if (!force && Date.now() - last < 250) return;
    last = Date.now();
    progress?.({ progress: Math.round(done * 100 / urls.length), completed: done, total: urls.length, bytes: [...totals.values()].reduce((a, b) => a + b, 0), file });
  };
  notify(true);
  const runners = Array.from({ length: Math.min(cacheName === SHELL ? 6 : 3, urls.length) }, async () => {
    while (index < urls.length) {
      const url = urls[index++], file = new URL(url).pathname.split('/').pop();
      const existing = await cached(url);
      if (existing) await cache.put(url, existing);
      else {
        let error;
        for (let attempt = 0; attempt < 2; attempt++) {
          try { notify(true, file); await cache.put(url, await getResponse(url, bytes => { totals.set(url, bytes); notify(false, file); })); error = null; break; }
          catch (failure) { error = failure; }
        }
        if (error) throw new Error(`Could not download ${file}. Check your connection and retry.`);
      }
      done++; notify(true, file);
    }
  });
  const results = await Promise.allSettled(runners);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
}
async function preparePdfResources(assets, send) {
  const cache = await caches.open(OFFLINE);
  if (!assets.pdfArchive || !assets.pdfResources?.length) return;
  const checks = await Promise.all(assets.pdfResources.map(async path => { const hit = await cached(local(path)); if (hit) await cache.put(local(path), hit); return hit; }));
  if (checks.every(Boolean)) return;
  send({ type: 'PHASE', phase: 'Downloading PDF support pack' });
  const response = await getResponse(local(assets.pdfArchive), bytes => send({ type: 'BYTES', bytes, file: 'PDF support pack' }));
  const archive = await self.JSZip.loadAsync(await response.arrayBuffer());
  for (const path of assets.pdfResources) {
    if (!path.startsWith('pdf-assets/') || path.includes('..') || !archive.file(path)) throw new Error('The PDF support pack is incomplete.');
    if (!(await cache.match(local(path)))) await cache.put(local(path), new Response(await archive.file(path).async('uint8array'), { headers: { 'Content-Type': 'application/octet-stream' } }));
  }
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const response = await getResponse(local('asset-manifest.json'));
      const manifest = await response.json();
      if (!manifest.files?.['main.js']) throw new Error('Build PixelPDF before enabling offline use.');
      if (BUILD !== 'v1' && manifest.files['main.js'].split('/').pop() !== BUILD) throw new Error('The deployment changed during setup. Reload and try again.');
      const assets = await assetLists();
      const compiled = Object.values(manifest.files).filter(path => /\.(js|css)$/.test(path));
      await fill(SHELL, ['index.html', 'asset-manifest.json', 'pwa-assets.json', ...compiled, ...assets.core], info => report({ type: 'SETUP_PROGRESS', ...info }));
      // Updates wait for the user or for all old windows to close. No forced reload.
    } catch (error) { await report({ type: 'SETUP_ERROR', message: error.message || 'App setup failed. Reload while online to retry.' }); await caches.delete(SHELL); throw error; }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    // Keep one older version for already-open windows and hashed lazy chunks.
    const keys = (await caches.keys()).filter(key => key.startsWith(PREFIX));
    const versions = [...new Set(keys.map(key => key.replace(/-(shell|offline)$/, '')))];
    const current = SHELL.replace(/-shell$/, '');
    const previous = versions.filter(version => version !== current).slice(-1);
    await Promise.all(keys.filter(key => ![current, ...previous].some(version => key === `${version}-shell` || key === `${version}-offline`)).map(key => caches.delete(key)));
  })());
});
async function cached(url) {
  const current = await (await caches.open(SHELL)).match(url) || await (await caches.open(OFFLINE)).match(url);
  if (current) return current;
  const keys = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== SHELL && key !== OFFLINE);
  for (const name of keys.reverse()) { const response = await (await caches.open(name)).match(url); if (response) return response; }
  return null;
}
function mirror(url) {
  // Existing PDF tools use this versioned CDN cMap URL. Serve the exact same
  // bundled PDF.js data locally, without changing their document workflows.
  const prefix = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  if (url.href === `${prefix}pdf.worker.min.js`) return local('ocr/pdf.worker.min.js');
  if (url.href.startsWith(`${prefix}cmaps/`) && /^[a-zA-Z0-9_.-]+\.bcmap$/.test(url.pathname.split('/').pop())) return local(`pdf-assets/cmaps/${url.pathname.split('/').pop()}`);
  return null;
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url), mirrored = mirror(url);
  if (mirrored) { event.respondWith((async () => await cached(mirrored) || fetch(mirrored))()); return; }
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if (request.mode === 'navigate') {
    // Network serves new releases immediately; cached shell handles offline routes.
    event.respondWith((async () => {
      try { const response = await fetch(request); if (response.ok) return response; } catch { /* Offline. */ }
      return await cached(local('index.html')) || new Response('PixelPDF is not ready offline. Connect once to prepare the app.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
    return;
  }
  const path = url.pathname.slice(BASE.pathname.length);
  if (!/^(static\/|icons\/|ocr\/|pdf-assets\/|pwa-libs\/)/.test(path) && !['logo.png', 'favicon.ico', 'manifest.json', 'pwa-assets.json'].includes(path)) return;
  event.respondWith((async () => {
    const hit = await cached(url.href); if (hit) return hit;
    // Only public application assets are cached. No user files, API requests or blobs.
    const response = await fetch(request);
    if (response.ok && response.type !== 'opaque') { const copy = response.clone(); event.waitUntil((async () => { try { await (await caches.open(OFFLINE)).put(request, copy); } catch { /* Storage full: online use still works. */ } })()); }
    return response;
  })());
});
self.addEventListener('message', event => {
  const port = event.ports?.[0];
  const send = data => { try { port?.postMessage(data); } catch { /* Window closed. */ } };
  if (event.data?.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (event.data?.type === 'STATUS') {
    event.waitUntil((async () => { const assets = await (await cached(local('pwa-assets.json'))).json(); const paths = [...assets.offline, ...(assets.pdfResources || [])]; const present = await Promise.all(paths.map(path => cached(local(path)))); send({ type: 'STATUS', ready: present.every(Boolean), version: VERSION }); })().catch(() => send({ type: 'STATUS', ready: false }))); 
  }
  if (event.data?.type === 'PREPARE_OFFLINE') {
    event.waitUntil((async () => {
      try {
        if (!preparing) preparing = (async () => {
          const assets = await assetLists();
          await preparePdfResources(assets, send);
          send({ type: 'PHASE', phase: 'Downloading scan engine and languages' });
          await fill(OFFLINE, assets.offline, info => { send({ type: 'PROGRESS', ...info }); report({ type: 'PROGRESS', ...info }); });
          await (await caches.open(OFFLINE)).put(READY, new Response(JSON.stringify({ version: VERSION, ready: true }), { headers: { 'Content-Type': 'application/json' } }));
        })().finally(() => { preparing = null; });
        await preparing; send({ type: 'READY' });
      } catch (error) { send({ type: 'ERROR', message: `${error.message || 'Offline setup could not finish.'} Check your connection and device storage, then retry. Completed files are saved.` }); }
    })());
  }
});
