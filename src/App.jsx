import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Image as ImageIcon,
  PenTool,
  Layers,
  FileSignature,
  Edit,
  Sliders,
  FileArchive,
  ShieldCheck,
  Zap,
  Menu,
  X,
  ChevronDown
} from 'lucide-react';
import TextToPdf from './pages/TextToPdf';
import ImageToPdf from './pages/ImageToPdf';
import PdfEditor from './pages/PdfEditor';
import MergeSplitPdf from './pages/MergeSplitPdf';
import DigitalSignaturePdf from './pages/DigitalSignaturePdf';
import FreehandPad from './pages/FreehandPad';
import ImageCompressor from './pages/ImageCompressor';
import PdfToImage from './pages/PdfToImage';

const tabs = [
  { id: 'text', label: 'Text to PDF', icon: FileText, desc: 'Convert formatted text to PDF' },
  { id: 'image', label: 'Image to PDF', icon: ImageIcon, desc: 'Combine pictures into PDF' },
  { id: 'editor', label: 'PDF Editor', icon: PenTool, desc: 'Edit text and annotations' },
  { id: 'signature', label: 'Sign Document', icon: FileSignature, desc: 'Draw, type or stamp signatures' },
  { id: 'freehand', label: 'Freehand Pad', icon: Edit, desc: 'Handwritten notes & sketchpad' },
  { id: 'mergesplit', label: 'Merge & Split', icon: Layers, desc: 'Combine or extract pages' },
  { id: 'compressor', label: 'Image Compressor', icon: Sliders, desc: 'Reduce file size & resize' },
  { id: 'pdftoimage', label: 'PDF to Image', icon: FileArchive, desc: 'Rasterize PDF pages to images' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('text');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];
  const CurrentIcon = currentTab.icon;

  const primaryTabs = tabs.slice(0, 5);
  const overflowTabs = tabs.slice(5);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectTab = (id) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
    setDropdownOpen(false);
  };

  const ActiveComponent = () => {
    switch (activeTab) {
      case 'text':
        return <TextToPdf />;
      case 'image':
        return <ImageToPdf />;
      case 'editor':
        return <PdfEditor />;
      case 'signature':
        return <DigitalSignaturePdf />;
      case 'freehand':
        return <FreehandPad />;
      case 'mergesplit':
        return <MergeSplitPdf />;
      case 'compressor':
        return <ImageCompressor />;
      case 'pdftoimage':
        return <PdfToImage />;
      default:
        return <TextToPdf />;
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,.08),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.08),_transparent_30%)] flex flex-col font-sans">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-3 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 shrink-0">
              <img
                src={`${process.env.PUBLIC_URL}/logo.png`}
                alt="PixelPDF logo"
                className="h-9 w-9 rounded-xl object-contain shadow-xs shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-lg font-black tracking-tight text-slate-900 leading-tight">
                  PixelPDF
                </h1>
                <p className="hidden xs:block text-[11px] text-slate-500 truncate">
                  Browser-based PDF utilities
                </p>
              </div>
            </div>

            <nav aria-label="Desktop tools switcher" className="hidden md:flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
              <div className="hidden 2xl:flex items-center gap-1">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectTab(id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                      activeTab === id
                        ? 'bg-white text-violet-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/50'
                    }`}
                  >
                    <Icon size={14} className="shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div className="flex 2xl:hidden items-center gap-1">
                {primaryTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectTab(id)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                      activeTab === id
                        ? 'bg-white text-violet-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/50'
                    }`}
                  >
                    <Icon size={14} className="shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}

                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                      overflowTabs.some((t) => t.id === activeTab)
                        ? 'bg-violet-50 text-violet-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <span>
                      {overflowTabs.find((t) => t.id === activeTab)?.label || 'More Tools'}
                    </span>
                    <ChevronDown size={13} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg animate-in fade-in slide-in-from-top-1 z-50">
                      {overflowTabs.map(({ id, label, icon: Icon, desc }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => selectTab(id)}
                          className={`flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left text-xs transition ${
                            activeTab === id
                              ? 'bg-violet-50 font-bold text-violet-700'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon size={15} className={activeTab === id ? 'text-violet-600' : 'text-slate-400'} />
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{label}</p>
                            <p className="text-[10px] text-slate-400 truncate">{desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </nav>

            <div className="flex md:hidden items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs active:bg-slate-100"
              >
                <CurrentIcon size={14} className="text-violet-600 shrink-0" />
                <span className="max-w-[120px] truncate">{currentTab.label}</span>
                <ChevronDown size={13} className={`text-slate-400 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation drawer"
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 active:bg-slate-100"
              >
                {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-100 bg-white/95 px-3 py-3 backdrop-blur-md md:hidden animate-in fade-in slide-in-from-top-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">
              Choose Toolkit Feature
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {tabs.map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectTab(id)}
                  className={`flex flex-col gap-0.5 rounded-xl border p-2.5 text-left transition touch-manipulation active:scale-[0.98] ${
                    activeTab === id
                      ? 'border-violet-600 bg-violet-50/80 text-violet-900 shadow-2xs'
                      : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon size={14} className={activeTab === id ? 'text-violet-600' : 'text-slate-500'} />
                    <span className="text-xs font-bold truncate">{label}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate">{desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl w-full px-3 py-4 sm:px-6 sm:py-6 lg:px-8 flex-1">
        <section
          aria-label="Key features"
          className="mb-4 sm:mb-6 flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 sm:grid sm:grid-cols-3 sm:gap-3 scrollbar-none"
        >
          <div className="flex shrink-0 sm:shrink items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 sm:p-3.5 backdrop-blur-xs shadow-2xs">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-600 shrink-0">
              <Zap size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">Runs locally</p>
              <p className="text-[10px] sm:text-xs text-slate-500 whitespace-nowrap sm:whitespace-normal">
                Files stay in browser
              </p>
            </div>
          </div>

          <div className="flex shrink-0 sm:shrink items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 sm:p-3.5 backdrop-blur-xs shadow-2xs">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <FileText size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">Searchable PDFs</p>
              <p className="text-[10px] sm:text-xs text-slate-500 whitespace-nowrap sm:whitespace-normal">
                Text remains selectable
              </p>
            </div>
          </div>

          <div className="flex shrink-0 sm:shrink items-center gap-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 sm:p-3.5 backdrop-blur-xs shadow-2xs">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <ShieldCheck size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">No upload required</p>
              <p className="text-[10px] sm:text-xs text-slate-500 whitespace-nowrap sm:whitespace-normal">
                Client-side processing
              </p>
            </div>
          </div>
        </section>

        <ActiveComponent />
      </main>

      <footer className="mx-auto max-w-7xl w-full px-4 pb-6 pt-2 text-center text-xs text-slate-400 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} PixelPDF · Browser-based PDF utilities
      </footer>
    </div>
  );
}