import React, { useMemo, useState } from 'react';
import { Download, FileText, RotateCcw } from 'lucide-react';
import { jsPDF } from 'jspdf';

const defaults = { text: 'Write or paste your content here…', color: '#111827', fontSize: 16, padding: 24 };

export default function TextToPdf() {
  const [settings, setSettings] = useState(defaults);
  const [busy, setBusy] = useState(false);
  const chars = useMemo(() => settings.text.length, [settings.text]);

  const reset = () => setSettings(defaults);
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
      const rgb = settings.color.match(/[0-9a-f]{2}/gi).map(v => parseInt(v, 16));
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
      let y = margin + fontSize;
      lines.forEach(line => { if (y > pageH - margin) { doc.addPage(); y = margin + fontSize; } doc.text(line, margin, y); y += lineHeight; });
      doc.save('pixelpdf-text.pdf');
    } finally { setBusy(false); }
  };

  return <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
    <div className="panel overflow-hidden">
      <div className="border-b border-slate-100 p-6"><div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><FileText size={20}/></span><div><h2 className="text-lg font-bold">Text to PDF</h2><p className="text-sm text-slate-500">Create a crisp, selectable PDF from plain text.</p></div></div></div>
      <div className="p-6"><textarea value={settings.text} onChange={e=>setSettings(s=>({...s,text:e.target.value}))} className="field min-h-[420px] resize-y font-mono text-sm leading-6" aria-label="PDF text content" />
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400"><span>{chars.toLocaleString()} characters</span><button onClick={reset} className="inline-flex items-center gap-1 font-semibold hover:text-slate-700"><RotateCcw size={13}/> Reset</button></div></div>
    </div>
    <aside className="panel h-fit p-6"><h3 className="font-bold">Document styling</h3><p className="mt-1 text-sm text-slate-500">These settings are applied when the PDF is generated.</p>
      <div className="mt-6 space-y-5">
        <label className="block"><span className="mb-2 block text-sm font-semibold">Text color</span><div className="flex gap-2"><input type="color" value={settings.color} onChange={e=>setSettings(s=>({...s,color:e.target.value}))} className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"/><input value={settings.color} onChange={e=>setSettings(s=>({...s,color:e.target.value}))} className="field" /></div></label>
        <label className="block"><div className="mb-2 flex justify-between text-sm font-semibold"><span>Font size</span><span className="text-slate-400">{settings.fontSize} pt</span></div><input type="range" min="8" max="40" value={settings.fontSize} onChange={e=>setSettings(s=>({...s,fontSize:e.target.value}))} className="w-full accent-violet-600"/></label>
        <label className="block"><div className="mb-2 flex justify-between text-sm font-semibold"><span>Page padding</span><span className="text-slate-400">{settings.padding} pt</span></div><input type="range" min="12" max="80" value={settings.padding} onChange={e=>setSettings(s=>({...s,padding:e.target.value}))} className="w-full accent-violet-600"/></label>
        <button onClick={download} disabled={!settings.text.trim() || busy} className="btn-primary w-full"><Download size={18}/>{busy ? 'Creating PDF…' : 'Download PDF'}</button>
      </div>
    </aside>
  </section>;
}
