// Deterministic service-worker lifecycle tests, using actual worker source.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const {createHash,webcrypto} = require('crypto');
const source=fs.readFileSync(require('path').join(__dirname,'../public/sw.js'),'utf8');
const origin='https://pixelpdf.test/';
const hash=data=>createHash('sha256').update(data).digest('hex');
function environment() {
  const storage=new Map(),downloads=[];let unavailable=false;
  let files={'ocr/eng.traineddata.gz':'English model','ocr/por.traineddata.gz':'Portuguese model'};
  const cacheStorage={
    keys:async()=>[...storage.keys()],delete:async name=>storage.delete(name),
    open:async name=>{
      if(!storage.has(name))storage.set(name,new Map());const entries=storage.get(name);
      const key=url=>typeof url==='string'?url:url.url;
      return {match:async url=>entries.get(key(url))?.clone(),put:async(url,response)=>entries.set(key(url),response.clone()),delete:async url=>entries.delete(key(url)),keys:async()=>[...entries.keys()].map(url=>new Request(url))};
    }
  };
  function spec(){const paths=Object.keys(files).sort(),hashes=Object.fromEntries(paths.map(p=>[p,hash(files[p])])),sizes=Object.fromEntries(paths.map(p=>[p,Buffer.byteLength(files[p])]));return{schemaVersion:2,core:[],offline:paths,pdfResources:[],hashes,sizes,toolsRevision:hash(JSON.stringify(paths.map(p=>[p,hashes[p]])))};}
  function worker(release) {
    const handlers={};const self={registration:{scope:origin},location:{href:origin+'sw.js'},clients:{matchAll:async()=>[],claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(type,handler)=>{handlers[type]=handler;}};
    const context={self,caches:cacheStorage,crypto:webcrypto,URL,Response,Request,Headers,Blob,AbortController,setTimeout,clearTimeout,importScripts:()=>{},console,
      fetch:async url=>{
        const path=new URL(url,origin).pathname.slice(1);downloads.push(path);if(unavailable)throw Error('Offline');
        if(path==='pwa-assets.json')return new Response(JSON.stringify(spec()));
        if(path==='asset-manifest.json')return new Response(JSON.stringify({files:{'main.js':'/static/js/main.1234.js'}}));
        if(path==='index.html')return new Response('<h1>'+release+'</h1>',{headers:{'Content-Type':'text/html'}});
        if(path in files)return new Response(files[path]);
        return new Response('bundle');
      }};
    vm.runInNewContext(source.replace(/const BUILD = '[^']+';/,`const BUILD = '${release}';`),context);
    async function dispatch(type,extra={}){let work;handlers[type]({waitUntil:p=>{work=p;},...extra});await work;}
    return {
      install:()=>dispatch('install'),activate:()=>dispatch('activate'),
      message:async type=>{const messages=[];await dispatch('message',{data:{type},ports:[{postMessage:value=>messages.push(value)}]});return messages;},
      fetch:async path=>{let result;handlers.fetch({request:new Request(origin+path),respondWith:p=>{result=p;},waitUntil:()=>{}});return result;}
    };
  }
  return {worker,downloads,storage,caches:cacheStorage,spec,setOffline:value=>{unavailable=value;},changeModel:()=>{files['ocr/por.traineddata.gz']='Updated Portuguese model';}};
}
test('tools persist offline across refresh and three releases without downloading again',async()=>{
  const env=environment(),first=env.worker('release-a');await first.install();await first.activate();
  assert.equal((await first.message('PREPARE_OFFLINE')).at(-1).type,'READY');
  env.setOffline(true);env.downloads.length=0;
  assert.equal((await env.worker('release-a').message('STATUS'))[0].ready,true);assert.equal(env.downloads.length,0);
  env.setOffline(false);
  for(const version of ['b','c','d']){env.downloads.length=0;const next=env.worker('release-'+version);await next.install();await next.activate();assert.equal((await next.message('STATUS'))[0].ready,true);assert.equal(env.downloads.filter(p=>p.startsWith('ocr/')).length,0);}
  assert.equal([...env.storage.keys()].filter(name=>name.includes('-tools-')).length,1);
});
test('only changed tool downloads during an update; old revision remains usable',async()=>{
  const env=environment(),first=env.worker('release-a');await first.install();await first.activate();await first.message('PREPARE_OFFLINE');
  env.changeModel();env.downloads.length=0;const next=env.worker('release-b');await next.install();await next.activate();
  assert.deepEqual(env.downloads.filter(p=>p.startsWith('ocr/')),['ocr/por.traineddata.gz']);
  assert.equal((await first.message('STATUS'))[0].ready,true);assert.equal((await next.message('STATUS'))[0].ready,true);
});
test('a missing cached model is detected and selectively repaired',async()=>{
  const env=environment(),worker=env.worker('release-a');await worker.install();await worker.activate();await worker.message('PREPARE_OFFLINE');
  for(const name of env.storage.keys())await(await env.caches.open(name)).delete(origin+'ocr/por.traineddata.gz');
  const status=(await worker.message('STATUS'))[0];assert.equal(status.ready,false);assert.equal(status.missing,1);
  env.downloads.length=0;await worker.message('PREPARE_OFFLINE');assert.deepEqual(env.downloads.filter(p=>p.startsWith('ocr/')),['ocr/por.traineddata.gz']);
});
test('legacy downloaded tools migrate without an internet connection',async()=>{
  const env=environment(),worker=env.worker('release-a');await worker.install();
  const legacy=await env.caches.open('pixelpdf-_-old-offline');
  for(const [path,text] of [['ocr/eng.traineddata.gz','English model'],['ocr/por.traineddata.gz','Portuguese model']])await legacy.put(origin+path,new Response(text));
  env.setOffline(true);env.downloads.length=0;
  assert.equal((await worker.message('STATUS'))[0].ready,true);assert.equal(env.downloads.length,0);
});
test('failed update preserves working shell and downloaded tools',async()=>{
  const env=environment(),worker=env.worker('release-a');await worker.install();await worker.activate();await worker.message('PREPARE_OFFLINE');
  env.setOffline(true);await assert.rejects(env.worker('release-b').install());
  assert.equal((await worker.message('STATUS'))[0].ready,true);
});
