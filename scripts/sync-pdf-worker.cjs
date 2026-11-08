// Run before CRA start/build. The worker must match the installed PDF.js API exactly.
const fs = require('fs');
const path = require('path');
const source = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
const dest = path.resolve(__dirname, '../public/pdf.worker.min.mjs');
fs.copyFileSync(source, dest);
console.log('Copied matching PDF.js worker to public/pdf.worker.min.mjs');
