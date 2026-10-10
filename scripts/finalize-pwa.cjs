// Stamp the worker from the actual compiled output, including build-time settings.
const fs=require('fs');
const path=require('path');
const {createHash}=require('crypto');
const root=path.resolve(__dirname,'../build');
const file=path.join(root,'sw.js');
const worker=fs.readFileSync(file,'utf8').replace(/const BUILD = '[^']+';/,"const BUILD = 'PIXELPDF_RELEASE';");
const release=createHash('sha256').update(worker).update(fs.readFileSync(path.join(root,'asset-manifest.json'))).update(fs.readFileSync(path.join(root,'pwa-assets.json'))).digest('hex');
fs.writeFileSync(file,worker.replace('PIXELPDF_RELEASE',release));
console.log('App update release: '+release.slice(0,12));
