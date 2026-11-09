// Keep the public worker byte-for-byte aligned with the installed PDF.js v3 API.
const fs = require('fs');
const path = require('path');
const pkg = require('pdfjs-dist/package.json');
if (pkg.version !== '3.11.174') throw new Error(`Expected pdfjs-dist 3.11.174, found ${pkg.version}`);
const source = require.resolve('pdfjs-dist/build/pdf.worker.min.js');
const target = path.resolve(__dirname, '../public/pdfjs/pdf.worker.min.js');
fs.mkdirSync(path.dirname(target), {recursive:true});
fs.copyFileSync(source, target);
console.log(`PDF.js ${pkg.version} local worker synchronized.`);
