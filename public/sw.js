/* PixelPDF offline v2: content-versioned tools, resumable downloads, safe updates.
   Only public application assets are cached; never documents or API responses. */
importScripts(new URL('pwa-libs/jszip.min.js', self.location.href).href);
const BASE = new URL(self.registration.scope);
const BUILD = '5d68bfe16488b1a1752659d55aed4cae33d5605b3eef56c18a9c5283e9999841';
const PREFIX = `pixelpdf-${BASE.pathname.replace(/[^a-z0-9]/gi, '_')}-`;
const VERSION = BUILD.replace(/[^a-z0-9._-]/gi, '_');
const SHELL = `${PREFIX}${VERSION}-shell`;
const SHELL_READY = new URL('__pixelpdf_shell_complete__', BASE).href;
const READY = new URL('__pixelpdf_offline_ready__', BASE).href;
const HASH = 'X-PixelPDF-SHA256';
const local = path => new URL(path, BASE).href;
let configuration, preparing = null;
async function report(data) {
  const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
  windows.forEach(window => window.postMessage({channel:'pixelpdf-offline', ...data}));
}
async function getResponse(url, onBytes) {
  const controller = new AbortController(); let timer;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), 30000); };
  arm();
  try {
    const response = await fetch(url, {cache:'no-store', signal:controller.signal});
    if (!response.ok || response.type === 'opaque' || (response.headers.get('Content-Type')?.includes('text/html') && !url.endsWith('index.html'))) throw Error(`Missing app file: ${new URL(url).pathname.split('/').pop()}`);
    const reader = response.body?.getReader(), chunks = []; let bytes = 0;
    if (reader) { while (true) { const item = await reader.read(); if (item.done) break; arm(); chunks.push(item.value); bytes += item.value.byteLength; onBytes?.(bytes); } }
    else { const blob = await response.blob(); chunks.push(blob); onBytes?.(blob.size); }
    const headers = new Headers(response.headers); headers.delete('Content-Encoding'); headers.delete('Content-Length');
    return new Response(new Blob(chunks), {status:response.status, headers});
  } finally {clearTimeout(timer);}
}
function validateAssets(assets) {
  if (assets.schemaVersion !== 2 || !/^[a-f0-9]{64}$/.test(assets.toolsRevision) || !Array.isArray(assets.core) || !Array.isArray(assets.offline) || !assets.hashes || !assets.sizes) throw Error('Build the app with yarn build to prepare the offline manifest.');
  for (const path of [...assets.core, ...assets.offline, ...(assets.pdfResources || [])]) {
    if (path.includes('..') || new URL(path, BASE).origin !== BASE.origin || !/^[a-f0-9]{64}$/.test(assets.hashes[path]) || !Number.isFinite(assets.sizes[path])) throw Error('Invalid offline asset list.');
  }
  return assets;
}
async function assets() {
  if (!configuration) configuration = (async () => {
    const response = await (await caches.open(SHELL)).match(local('pwa-assets.json'));
    if (!response) throw Error('The app shell needs repair. Reconnect and check for updates.');
    return validateAssets(await response.json());
  })().catch(error => {configuration = null; throw error;});
  return configuration;
}
const toolsName = async () => `${PREFIX}tools-${(await assets()).toolsRevision}`;
const tools = async () => caches.open(await toolsName());
async function verified(response, path) {
  if (!response?.ok) return null;
  const spec = await assets(), expected = spec.hashes[path];
  if (!expected) return response;
  if (response.headers.get(HASH) === expected) return response;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== spec.sizes[path]) return null;
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2,'0')).join('');
  if (hash !== expected) return null;
  const headers = new Headers(response.headers); headers.set(HASH,hash);
  return new Response(bytes,{status:200,headers});
}
async function reuse(path, target) {
  const url = local(path);
  const own = await verified(await target.match(url),path);
  if (own) {if (!own.headers.get(HASH)) return own; return own;}
  for (const name of (await caches.keys()).filter(name => name.startsWith(PREFIX)).reverse()) {
    const source = await caches.open(name);
    const hit = await verified(await source.match(url),path);
    if (hit) {await target.put(url,hit.clone()); return hit;}
  }
  return null;
}
async function fill(cache, paths, progress, reuseFiles = true) {
  const unique = [...new Set(paths)]; let index=0, done=0, last=0; const totals=new Map();
  const notify = (force=false,file='') => {
    if (!force && Date.now()-last<250) return; last=Date.now();
    progress?.({progress:Math.round(done*100/unique.length),completed:done,total:unique.length,bytes:[...totals.values()].reduce((a,b)=>a+b,0),file});
  };
  notify(true);
  const results = await Promise.allSettled(Array.from({length:Math.min(3,unique.length)},async()=>{
    while (index<unique.length) {
      const path=unique[index++], file=path.split('/').pop();
      if (!reuseFiles || !await reuse(path,cache)) {
        let failure;
        for (let attempt=0;attempt<2;attempt++) {
          try {
            notify(true,file);
            const response=await verified(await getResponse(local(path),bytes=>{totals.set(path,bytes);notify(false,file);}),path);
            if (!response) throw Error('File integrity check failed.');
            await cache.put(local(path),response); failure=null; break;
          } catch(error) {failure=error;}
        }
        if (failure) throw Error(`Could not save ${file}. Check your connection and available storage, then retry.`);
      }
      done++;notify(true,file);
    }
  }));
  const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
}
async function offlineStatus(migrate=true) {
  const spec=await assets(), cache=await tools();
  const paths=[...new Set([...spec.offline,...(spec.pdfResources||[])])];
  let present=0;
  // Bounded checks; legacy files are verified once and carried forward offline.
  for (const path of paths) {
    const hit=migrate ? await reuse(path,cache) : await verified(await cache.match(local(path)),path);
    if (hit) present++;
  }
  const ready=present===paths.length;
  if (ready) await cache.put(READY,new Response(JSON.stringify({ready:true,revision:spec.toolsRevision})));
  else await cache.delete(READY);
  return {type:'STATUS',ready,preparing:Boolean(preparing),present,total:paths.length,missing:paths.length-present,version:VERSION};
}
async function prepare(send) {
  const spec=await assets(),cache=await tools();
  if (spec.pdfArchive && spec.pdfResources?.length) {
    const missing=[];
    for(const path of spec.pdfResources) if(!await reuse(path,cache)) missing.push(path);
    if(missing.length) {
      send({type:'PHASE',phase:'Downloading PDF support pack'});
      const response=await verified(await getResponse(local(spec.pdfArchive),bytes=>send({type:'BYTES',bytes,file:'PDF support pack'})),spec.pdfArchive);
      if(!response)throw Error('PDF support pack integrity check failed.');
      const archive=await self.JSZip.loadAsync(await response.arrayBuffer());
      for(const path of missing) {
        if(!path.startsWith('pdf-assets/')||!archive.file(path))throw Error('The PDF support pack is incomplete.');
        const hit=await verified(new Response(await archive.file(path).async('uint8array'),{headers:{'Content-Type':'application/octet-stream'}}),path);
        if(!hit)throw Error('PDF support file integrity check failed.');
        await cache.put(local(path),hit);
      }
    }
  }
  send({type:'PHASE',phase:'Saving scan engine and languages'});
  await fill(cache,spec.offline,info=>send({type:'PROGRESS',...info}));
  const status=await offlineStatus(false);
  if(!status.ready)throw Error('Some offline files are missing. Retry to repair them.');
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try {
    const manifestResponse=await getResponse(local('asset-manifest.json'));
    const manifest=await manifestResponse.clone().json();
    if(!manifest.files?.['main.js'])throw Error('Deployment changed during setup. Reload while online.');
    const listResponse=await getResponse(local('pwa-assets.json'));
    const list=validateAssets(await listResponse.clone().json());configuration=Promise.resolve(list);
    const shell=await caches.open(SHELL);
    await shell.put(local('pwa-assets.json'),listResponse);
    await shell.put(local('asset-manifest.json'),manifestResponse);
    const compiled=Object.values(manifest.files).filter(path=>/\.(js|css)$/.test(path));
    // Fresh entrypoint; immutable hashed bundles and verified core assets are reusable.
    await fill(shell,['index.html'],null,false);
    await fill(shell,[...compiled,...list.core],info=>report({type:'SETUP_PROGRESS',...info}));
    let previouslyPrepared=false;
    for(const name of await caches.keys())if(name.startsWith(PREFIX)&&await(await caches.open(name)).match(READY)){previouslyPrepared=true;break;}
    if(previouslyPrepared) {
      await report({type:'UPDATE_PROGRESS',phase:'Preparing your saved offline tools for the update'});
      await prepare(data=>report({...data,type:'UPDATE_PROGRESS'}));
    }
    await shell.put(SHELL_READY, new Response('ready'));
    // Wait for explicit restart; failed updates never remove the working release.
  } catch(error) {await report({type:'SETUP_ERROR',message:error.message});throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await self.clients.claim();
  const keys=await caches.keys(),shells=[];
  for(const name of keys.filter(name=>name.startsWith(PREFIX)&&name.endsWith('-shell'))){const cache=await caches.open(name),list=await cache.match(local('pwa-assets.json'));if(await cache.match(SHELL_READY)||list&&(await list.json()).schemaVersion!==2)shells.push(name);}
  const keep=new Set([SHELL,...shells.filter(name=>name!==SHELL).slice(-1)]);
  // Keep only tool revisions referenced by the current and previous shells.
  const toolNames=new Set([await toolsName()]);
  for(const name of keep){const list=await(await caches.open(name)).match(local('pwa-assets.json'));if(list){const data=await list.json();if(data.toolsRevision)toolNames.add(`${PREFIX}tools-${data.toolsRevision}`);else toolNames.add(name.replace(/-shell$/,'-offline'));}}
  const status=await offlineStatus();
  if(status.ready)await Promise.all(keys.filter(name=>name.startsWith(PREFIX)&&!keep.has(name)&&!toolNames.has(name)).map(name=>caches.delete(name)));
  await report(status);
})()));
async function cached(url) {
  const shell=await caches.open(SHELL), own=await shell.match(url);if(own)return own;
  const path=new URL(url).pathname.slice(BASE.pathname.length),spec=await assets();
  if([...spec.offline,...(spec.pdfResources||[])].includes(path))return reuse(path,await tools());
  // Old hashed chunks can still serve an already-open tab during an update.
  if(/^static\/.+\.[a-f0-9]+\.(js|css)$/.test(path))for(const name of(await caches.keys()).filter(name=>name.startsWith(PREFIX)&&name.endsWith('-shell')).reverse()){const hit=await(await caches.open(name)).match(url);if(hit)return hit;}
  return null;
}
function mirror(url) {
  const prefix='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  if(url.href===`${prefix}pdf.worker.min.js`)return local('ocr/pdf.worker.min.js');
  if(url.href.startsWith(`${prefix}cmaps/`)&&/^[a-zA-Z0-9_.-]+\.bcmap$/.test(url.pathname.split('/').pop()))return local(`pdf-assets/cmaps/${url.pathname.split('/').pop()}`);
  return null;
}
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url),mirrored=mirror(url);
  if(mirrored){event.respondWith((async()=>await cached(mirrored)||fetch(mirrored))());return;}
  if(url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
  // A controlled window keeps its coherent release until an explicit update.
  if(request.mode==='navigate'){event.respondWith((async()=>await(await caches.open(SHELL)).match(local('index.html'))||fetch(request))());return;}
  const path=url.pathname.slice(BASE.pathname.length);
  if(!/^(static\/|icons\/|ocr\/|pdf-assets\/|pwa-libs\/)/.test(path)&&!['logo.png','favicon.ico','manifest.json','pwa-assets.json'].includes(path))return;
  event.respondWith((async()=>{
    const hit=await cached(url.href);if(hit)return hit;
    const response=await fetch(request);
    if(response.ok&&response.type!=='opaque')event.waitUntil((async()=>{
      try {const checked=await verified(response.clone(),path);if(!checked)return;
        const spec=await assets();const target=[...spec.offline,...(spec.pdfResources||[])].includes(path)?await tools():await caches.open(SHELL);
        await target.put(request,checked);
      }catch{/* Online operation remains usable when storage is full. */}
    })());
    return response;
  })());
});
self.addEventListener('message',event=>{
  const port=event.ports?.[0];const send=data=>{try{port?.postMessage(data);}catch{/* Window closed. */}};
  if(event.data?.type==='SKIP_WAITING'){event.waitUntil(self.skipWaiting());return;}
  if(event.data?.type==='STATUS')event.waitUntil(offlineStatus().then(send).catch(error=>send({type:'STATUS',ready:false,message:error.message})));
  if(event.data?.type==='PREPARE_OFFLINE')event.waitUntil((async()=>{
    try {
      if(!preparing)preparing=prepare(data=>{send(data);report(data);}).finally(()=>{preparing=null;});
      await preparing;send({type:'READY'});await report({type:'READY'});
    }catch(error){const failure={type:'ERROR',message:`${error.message} Completed files are saved; retry downloads only missing files.`};send(failure);await report(failure);}
  })());
});
