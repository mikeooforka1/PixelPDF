const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p));
const manifest = JSON.parse(read('public/pwa-assets.json'));
test('all offline assets are present and match their declared hashes', () => {
  const files = new Set([...manifest.core, ...manifest.offline, ...manifest.pdfResources, manifest.pdfArchive]);
  for (const file of files) {
    assert.ok(!file.includes('..'), `unsafe path ${file}`);
    const bytes = read(`public/${file}`);
    assert.equal(bytes.length, manifest.sizes[file], `size mismatch: ${file}`);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.hashes[file],`hash mismatch: ${file}`);
  }
});
test('PDF tools reference only local PDF.js 3 worker and resources', () => {
  for(const file of ['src/App.jsx','src/pages/PdfEditor.jsx','src/pages/ProtectPdf.jsx','src/pages/PdfToImage.jsx','src/pages/MergeSplitPdf.jsx','src/pages/DigitalSignaturePdf.jsx','src/pages/DocumentWorkspace.jsx','src/utils/conversions.js']) {
    const text=read(file).toString();
    assert.doesNotMatch(text,/unpkg\.com|cdnjs\.cloudflare\.com|pdf\.worker\.min\.mjs/,file);
  }
  assert.ok(manifest.core.includes('pdfjs/pdf.worker.min.js'));
  assert.ok(manifest.offline.includes('protect/qpdf.wasm'));
  assert.ok(manifest.offline.includes('protect/protect-worker.js'));
  assert.ok(manifest.offline.includes('protect/qpdf.js'));
});
