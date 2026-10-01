import React, { useMemo, useState } from 'react';
import { Download, FileText, RotateCcw } from 'lucide-react';
import { jsPDF } from 'jspdf';

const defaults = {
  text: 'Write or paste your content here…',
  color: '#111827',
  fontSize: 16,
  padding: 24,
};

export default function TextToPdf() {
  const [settings, setSettings] = useState(defaults);
  const [fileName, setFileName] = useState('pixelpdf-text');
  const [busy, setBusy] = useState(false);
  const chars = useMemo(() => settings.text.length, [settings.text]);

  const reset = () => {
    setSettings(defaults);
    setFileName('pixelpdf-text');
  };

  const download = () => {
    if (!settings.text.trim()) return;
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = Number(settings.padding);
      const fontSize = Number(settings.fontSize);
      const lineHeight = fontSize * 1.45;
      const maxWidth = Math.max(40, pageW - margin * 2);
      const lines = doc.splitTextToSize(settings.text.replace(/\r\n/g, '\n'), maxWidth);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);

      const rgbColor = settings.color.match(/[0-9a-f]{2}/gi)?.map((v) => parseInt(v, 16)) || [0, 0, 0];
      doc.setTextColor(rgbColor[0], rgbColor[1], rgbColor[2]);

      let y = margin + fontSize;
      lines.forEach((line) => {
        if (y > pageH - margin) {
          doc.addPage();
          y = margin + fontSize;
        }
        doc.text(line, margin, y);
        y += lineHeight;
      });

      const cleanName = fileName.trim().replace(/\.pdf$/i, '') || 'pixelpdf-text';
      doc.save(`${cleanName}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr] items-start w-full">
      <div className="panel overflow-hidden border border-slate-200/80 shadow-xs">
        <div className="border-b border-slate-100 p-4 sm:p-5 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-violet-100 p-2 text-violet-700 shrink-0">
              <FileText size={20} />
            </span>
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Text to PDF</h2>
              <p className="text-xs sm:text-sm text-slate-500">Create a clean, selectable PDF from text.</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <textarea
            value={settings.text}
            onChange={(e) => setSettings((s) => ({ ...s, text: e.target.value }))}
            className="field min-h-[300px] sm:min-h-[400px] w-full resize-y font-mono text-sm leading-6"
            aria-label="PDF text content"
            placeholder="Type your document content here..."
          />
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{chars.toLocaleString()} characters</span>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 transition"
            >
              <RotateCcw size={12} /> Reset Default
            </button>
          </div>
        </div>
      </div>

      <aside className="panel p-4 sm:p-5 border border-slate-200/80 shadow-xs">
        <h3 className="text-base font-bold text-slate-900">Document Settings</h3>
        <p className="mt-1 text-xs text-slate-500">Configure appearance and file naming.</p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">PDF File Name</span>
            <div className="relative flex items-center">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="pixelpdf-text"
                className="field w-full pr-12 text-sm"
              />
              <span className="pointer-events-none absolute right-3 text-xs font-semibold text-slate-400">.pdf</span>
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Text Color</span>
            <div className="flex gap-2">
              <input
                type="color"
                value={settings.color}
                onChange={(e) => setSettings((s) => ({ ...s, color: e.target.value }))}
                className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
              />
              <input
                value={settings.color}
                onChange={(e) => setSettings((s) => ({ ...s, color: e.target.value }))}
                className="field flex-1 font-mono text-sm"
              />
            </div>
          </label>

          <label className="block">
            <div className="mb-1 flex justify-between text-xs font-semibold text-slate-700">
              <span>Font Size</span>
              <span className="text-slate-500">{settings.fontSize} pt</span>
            </div>
            <input
              type="range"
              min="8"
              max="40"
              value={settings.fontSize}
              onChange={(e) => setSettings((s) => ({ ...s, fontSize: e.target.value }))}
              className="w-full accent-violet-600"
            />
          </label>

          <label className="block">
            <div className="mb-1 flex justify-between text-xs font-semibold text-slate-700">
              <span>Page Margins</span>
              <span className="text-slate-500">{settings.padding} pt</span>
            </div>
            <input
              type="range"
              min="12"
              max="80"
              value={settings.padding}
              onChange={(e) => setSettings((s) => ({ ...s, padding: e.target.value }))}
              className="w-full accent-violet-600"
            />
          </label>

          <button
            type="button"
            onClick={download}
            disabled={!settings.text.trim() || busy}
            className="btn-primary w-full justify-center py-2.5 text-sm"
          >
            <Download size={15} />
            {busy ? 'Creating PDF…' : 'Download PDF'}
          </button>
        </div>
      </aside>
    </section>
  );
}