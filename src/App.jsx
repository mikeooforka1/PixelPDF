import React, { useState } from 'react';
import { FileText, Image as ImageIcon, PenTool, ShieldCheck, Zap } from 'lucide-react';
import TextToPdf from './components/TextToPdf';
import ImageToPdf from './components/ImageToPdf';
import PdfEditor from './components/PdfEditor';

const tabs = [
  { id: 'text', label: 'Text to PDF', icon: FileText },
  { id: 'image', label: 'Image to PDF', icon: ImageIcon },
  { id: 'editor', label: 'PDF Editor', icon: PenTool }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('text');
  const Active = activeTab === 'text' ? TextToPdf : activeTab === 'image' ? ImageToPdf : PdfEditor;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,.08),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.08),_transparent_30%)]">
      <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <img src={`${process.env.PUBLIC_URL}/logo.svg`} alt="PixelPDF logo" className="h-11 w-11 rounded-xl" />
              <div><h1 className="text-xl font-black tracking-tight">PixelPDF</h1><p className="text-xs text-slate-500">Simple PDF tools, right in your browser.</p></div>
            </div>
            <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-1.5">
              {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${activeTab === id ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}><Icon size={16}/>{label}</button>)}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-7 grid gap-3 sm:grid-cols-3">
          <div className="panel flex items-center gap-3 p-4"><Zap className="text-violet-600" size={20}/><div><p className="text-sm font-bold">Runs locally</p><p className="text-xs text-slate-500">Files stay in your browser.</p></div></div>
          <div className="panel flex items-center gap-3 p-4"><FileText className="text-blue-600" size={20}/><div><p className="text-sm font-bold">Searchable PDFs</p><p className="text-xs text-slate-500">Text remains selectable.</p></div></div>
          <div className="panel flex items-center gap-3 p-4"><ShieldCheck className="text-emerald-600" size={20}/><div><p className="text-sm font-bold">No upload required</p><p className="text-xs text-slate-500">Processing happens client-side.</p></div></div>
        </section>
        <Active />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 pt-2 text-center text-xs text-slate-400 sm:px-6 lg:px-8">© {new Date().getFullYear()} PixelPDF · Browser-based PDF utilities</footer>
    </div>
  );
}
