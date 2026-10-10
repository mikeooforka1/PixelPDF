// Generate content revisions before every production build. No network required.
const fs = require('fs');
const path = require('path');
const {createHash} = require('crypto');
const root = path.resolve(__dirname, '../public');
const filename = path.join(root, 'pwa-assets.json');
const assets = JSON.parse(fs.readFileSync(filename, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = [...new Set([...assets.core, ...assets.offline, ...(assets.pdfResources || []), ...(assets.pdfArchive ? [assets.pdfArchive] : [])])];
assets.hashes = {};
assets.sizes = {};
for (const relative of paths) {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) throw Error('Unsafe asset path: ' + relative);
  const bytes = fs.readFileSync(absolute);
  assets.hashes[relative] = digest(bytes);
  assets.sizes[relative] = bytes.length;
}
assets.toolsRevision = digest(JSON.stringify([...new Set([...assets.offline, ...(assets.pdfResources || [])])].sort().map(p => [p, assets.hashes[p]])));
assets.schemaVersion = 2;
fs.writeFileSync(filename, JSON.stringify(assets, null, 2) + '\n');
console.log('Offline assets verified: ' + paths.length + ' files; tools revision ' + assets.toolsRevision.slice(0,12));

// Change the worker bytes on every app/content change, even with the same URL.
const workerFile = path.join(root, 'sw.js');
const workerSource = fs.readFileSync(workerFile, 'utf8').replace(/const BUILD = '[^']+';/, "const BUILD = 'PIXELPDF_RELEASE';");
const appFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(jsx?|css|json)$/.test(file) && !/\.test\./.test(file)) appFiles.push(file);
  }
}
walk(path.resolve(__dirname, '../src'));
const release = digest(Buffer.concat([Buffer.from(workerSource), Buffer.from(JSON.stringify(assets)), fs.readFileSync(path.resolve(__dirname,'../package.json')), fs.readFileSync(path.join(root,'index.html')), ...appFiles.sort().map(file=>Buffer.concat([Buffer.from(path.relative(path.resolve(__dirname,'..'),file)), fs.readFileSync(file)]))]));
fs.writeFileSync(workerFile, workerSource.replace('PIXELPDF_RELEASE', release));
