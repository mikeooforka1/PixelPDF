import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
export function safeName(name) { return (name || 'document').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.+$/g, '').slice(0, 100) || 'document'; }
export function escapeHTML(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
export async function createDocument(text, format) {
  if (!text.trim()) throw new Error('Add or scan text before exporting.');
  if (format === 'docx') return Packer.toBlob(new Document({ sections: [{ children: text.split('\n').map(line => new Paragraph({ children: [new TextRun(line)] })) }] }));
  if (format === 'pdf') {
    // Standard PDF fonts do not cover arbitrary scripts: avoid silent corrupted exports.
    if (/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/.test(text)) throw new Error('For this script, choose DOCX or TXT to preserve every character. PDF supports Latin text in this tool.');
    const pdf = new jsPDF(); pdf.setFontSize(12);
    let y = 20;
    for (const paragraph of text.split('\n')) {
      for (const line of pdf.splitTextToSize(paragraph || ' ', 170)) {
        if (y > 277) { pdf.addPage(); y = 20; }
        pdf.text(line, 20, y); y += 6;
      }
    }
    return pdf.output('blob');
  }
  if (format === 'txt') return new Blob([text], { type: 'text/plain;charset=utf-8' });
  if (format === 'html') return new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>Document</title></head><body><pre style="white-space:pre-wrap;font-family:serif">${escapeHTML(text)}</pre></body></html>`], { type: 'text/html;charset=utf-8' });
  throw new Error('Unsupported export format.');
}
export async function downloadDocument(text, format, name) {
  const blob = await createDocument(text, format); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${safeName(name)}.${format}`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
