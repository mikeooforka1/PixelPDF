/* PixelPDF: versioned app-shell caching. Never caches uploaded documents. */
const BASE = new URL(self.registration.scope);
const BUILD = new URL(self.location.href).searchParams.get('build') || 'v1';
const PREFIX = `pixelpdf-${BASE.pathname.replace(/[^a-z0-9]/gi, '_')}-`;
const VERSION = BUILD.replace(/[^a-z0-9._-]/gi, '_');
const SHELL = `${PREFIX}${VERSION}-shell`;
const OFFLINE = `${PREFIX}${VERSION}-offline`;
const READY = new URL('__pixelpdf_offline_ready__', BASE).href;
let preparing = null;
const local = path => new URL(path, BASE).href;
async function getResponse(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok || response.type === 'opaque') throw new Error('A required app file could not be downloaded.');
    // Read the body within the deadline, rather than leaving an incomplete cache entry.
    const body = await response.blob();
    return new Response(body, { status: response.status, headers: response.headers });
  } finally { clearTimeout(timer); }
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
  const runners = Array.from({ length: Math.min(3, urls.length) }, async () => {
    while (index < urls.length) {
      const url = urls[index++];
      if (!(await cache.match(url))) await cache.put(url, await getResponse(url));
      done++; if (progress) progress(Math.round(done * 100 / urls.length));
    }
  });
  // Await every runner on failure as well, so an install cannot leave writes running.
  const results = await Promise.allSettled(runners);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
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
      await fill(SHELL, ['index.html', 'asset-manifest.json', 'pwa-assets.json', ...compiled, ...assets.core]);
      // Updates wait for the user or for all old windows to close. No forced reload.
    } catch (error) { await caches.delete(SHELL); throw error; }
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
  if (!/^(static\/|icons\/|ocr\/|pdf-assets\/)/.test(path) && !['logo.png', 'favicon.ico', 'manifest.json', 'pwa-assets.json'].includes(path)) return;
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
    event.waitUntil((async () => send({ type: 'STATUS', ready: Boolean(await (await caches.open(OFFLINE)).match(READY)), version: VERSION }))());
  }
  if (event.data?.type === 'PREPARE_OFFLINE') {
    event.waitUntil((async () => {
      try {
        if (!preparing) preparing = (async () => {
          const assets = await assetLists();
          await fill(OFFLINE, assets.offline, progress => send({ type: 'PROGRESS', progress }));
          await (await caches.open(OFFLINE)).put(READY, new Response(JSON.stringify({ version: VERSION, ready: true }), { headers: { 'Content-Type': 'application/json' } }));
        })().finally(() => { preparing = null; });
        await preparing; send({ type: 'READY' });
      } catch { send({ type: 'ERROR', message: 'Offline setup could not finish. Check your connection and available device storage, then retry.' }); }
    })());
  }
});
