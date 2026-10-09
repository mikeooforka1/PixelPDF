import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Download,
  Image as ImageIcon,
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
import DocumentWorkspace from './pages/DocumentWorkspace';
import TextToPdf from './pages/TextToPdf';
import ImageToPdf from './pages/ImageToPdf';
import MergeSplitPdf from './pages/MergeSplitPdf';
import DigitalSignaturePdf from './pages/DigitalSignaturePdf';
import FreehandPad from './pages/FreehandPad';
import ImageCompressor from './pages/ImageCompressor';
import PdfToImage from './pages/PdfToImage';
import * as pdfjsLib from 'pdfjs-dist';

// All document tools share the same, bundled worker when installed or offline.
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/ocr/pdf.worker.min.js`;

const tabs = [
  { id: 'text', label: 'Text to PDF', icon: FileText, desc: 'Convert formatted text to PDF' },
  { id: 'image', label: 'Image to PDF', icon: ImageIcon, desc: 'Combine pictures into PDF' },
  { id: 'signature', label: 'Sign Document', icon: FileSignature, desc: 'Draw, type or stamp signatures' },
  { id: 'freehand', label: 'Freehand Pad', icon: Edit, desc: 'Handwritten notes & sketchpad' },
  { id: 'mergesplit', label: 'Merge & Split', icon: Layers, desc: 'Combine or extract pages' },
  { id: 'compressor', label: 'Image Compressor', icon: Sliders, desc: 'Reduce file size & resize' },
  { id: 'pdftoimage', label: 'PDF to Image', icon: FileArchive, desc: 'Rasterize PDF pages to images' },
  { id: 'scan', label: 'Scan to Document', icon: FileText, desc: 'Camera OCR to Word, PDF and text' },
  { id: 'extract', label: 'PDF to Text', icon: FileText, desc: 'Extract editable text from PDFs' }
];

// Map URL paths to tab keys
const pathToTab = {
  '/ScanToDocument': 'scan',
  '/PdfToText': 'extract',
  '/TextToPdf': 'text',
  '/ImageToPdf': 'image',
  '/PdfEditor': 'extract', // Old bookmarks now open PDF to Text.
  '/DigitalSignaturePdf': 'signature',
  '/FreehandPad': 'freehand',
  '/MergeSplitPdf': 'mergesplit',
  '/ImageCompressor': 'compressor',
  '/PdfToImage': 'pdftoimage',
};

// Map tab keys to clean URL paths
const tabToPath = {
  scan: '/ScanToDocument',
  extract: '/PdfToText',
  text: '/TextToPdf',
  image: '/ImageToPdf',
  signature: '/DigitalSignaturePdf',
  freehand: '/FreehandPad',
  mergesplit: '/MergeSplitPdf',
  compressor: '/ImageCompressor',
  pdftoimage: '/PdfToImage',
};


function isAppWindow() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone);
}
export function InstallAppPanel() {
  const [appMode, setAppMode] = useState(isAppWindow);
  const [installed, setInstalled] = useState(isAppWindow);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [offline, setOffline] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState(null);
  const [prompting, setPrompting] = useState(false);
  const [canPrompt, setCanPrompt] = useState(Boolean(window.pixelpdfInstallPrompt));
  const [updateReady, setUpdateReady] = useState(false);
  const promptRef = useRef(window.pixelpdfInstallPrompt);
  const registration = useRef(null), panel = useRef(null), installButton = useRef(null);
  const mounted = useRef(true), offlinePort = useRef(null), reloading = useRef(false), wasDialogOpen = useRef(false), preparingRef = useRef(false), setupTimer = useRef(null);
  const baseURL = new URL(`${process.env.PUBLIC_URL || ''}/`, window.location.origin);

  function send(worker, data, handle) {
    if (!worker) return;
    const channel = new MessageChannel();
    channel.port1.onmessage = event => {
      if (mounted.current) handle(event.data);
      if (['READY', 'ERROR', 'STATUS'].includes(event.data.type)) channel.port1.close();
    };
    worker.postMessage(data, [channel.port2]);
    return channel.port1;
  }
  async function prepareOffline() {
    if (preparingRef.current) return;
    if (!navigator.onLine) { setMessage('Connect to the internet once to prepare offline use.'); return; }
    if (!window.isSecureContext || !('serviceWorker' in navigator)) {
      setMessage('Offline setup needs HTTPS and a browser that supports service workers.'); return;
    }
    preparingRef.current = true;
    setOffline('preparing'); setProgress(0); setMessage('');
    try {
      // Best effort: supported browsers may retain app assets more reliably.
      navigator.storage?.persist?.().catch(() => {});
      const ready = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('App setup is not ready. Reload while online and try again.')), 30000))]);
      if (!mounted.current) return;
      offlinePort.current?.close();
      setupTimer.current = setTimeout(() => { preparingRef.current = false; offlinePort.current?.close(); if (mounted.current) { setOffline('error'); setMessage('Offline setup paused. Reconnect and use Prepare offline to retry.'); } }, 300000);
      offlinePort.current = send(ready.active, { type: 'PREPARE_OFFLINE' }, data => {
        if (data.type === 'PROGRESS') setProgress(data.progress);
        if (data.type === 'READY') { clearTimeout(setupTimer.current); preparingRef.current = false; setOffline('ready'); setProgress(100); setMessage(''); }
        if (data.type === 'ERROR') { clearTimeout(setupTimer.current); preparingRef.current = false; setOffline('error'); setMessage(data.message); }
      });
    } catch (error) { preparingRef.current = false; if (mounted.current) { setOffline('error'); setMessage(error.message || 'Offline setup is unavailable.'); } }
  }
  useEffect(() => {
    mounted.current = true;
    const onInstallReady = () => { promptRef.current = window.pixelpdfInstallPrompt; setCanPrompt(Boolean(promptRef.current)); };
    const onInstalled = () => { promptRef.current = null; setCanPrompt(false); setInstalled(true); setDialog(null); prepareOffline(); };
    const onNetwork = () => setOnline(navigator.onLine);
    const mode = window.matchMedia?.('(display-mode: standalone)');
    const onMode = () => { const value = isAppWindow(); setAppMode(value); if (value) setInstalled(true); };
    window.addEventListener('pixelpdf-install-ready', onInstallReady);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onNetwork); window.addEventListener('offline', onNetwork);
    mode?.addEventListener?.('change', onMode);
    const onController = () => {
      if (reloading.current) { window.location.reload(); return; }
      send(navigator.serviceWorker.controller, { type: 'STATUS' }, data => { if (data.ready) setOffline('ready'); });
    };
    if (process.env.NODE_ENV === 'production' && window.isSecureContext && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', onController);
      const script = [...document.scripts].map(item => item.src).find(src => /\/main\.[^/]+\.js$/.test(src));
      const build = script ? new URL(script).pathname.split('/').pop() : 'v1';
      navigator.serviceWorker.register(new URL(`sw.js?build=${encodeURIComponent(build)}`, baseURL), { scope: baseURL.pathname, updateViaCache: 'none' })
        .then(reg => {
          if (!mounted.current) return; registration.current = reg;
          if (reg.waiting) setUpdateReady(true);
          reg.addEventListener('updatefound', () => {
            const next = reg.installing;
            next?.addEventListener('statechange', () => {
              if (!mounted.current) return;
              if (next.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(Boolean(reg.waiting));
              if (next.state === 'redundant') setMessage('App setup could not finish. Reload while online to retry.');
            });
          });
          if (reg.active) send(reg.active, { type: 'STATUS' }, data => { if (data.ready) setOffline('ready'); });
          if (isAppWindow()) prepareOffline();
        }).catch(() => { if (mounted.current) setMessage('Offline setup is unavailable. You can keep using the tools online.'); });
    }
    return () => {
      mounted.current = false; offlinePort.current?.close(); clearTimeout(setupTimer.current);
      window.removeEventListener('pixelpdf-install-ready', onInstallReady);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onNetwork); window.removeEventListener('offline', onNetwork);
      mode?.removeEventListener?.('change', onMode);
      navigator.serviceWorker?.removeEventListener('controllerchange', onController);
    };
    // Register once. Tools and menu state must not restart setup or install prompts.
  }, []);
  useEffect(() => {
    if (dialog && panel.current) {
      if (panel.current.showModal) panel.current.showModal();
      else panel.current.setAttribute('open', '');
    }
    if (!dialog && wasDialogOpen.current) installButton.current?.focus({ preventScroll: true });
    wasDialogOpen.current = Boolean(dialog);
  }, [dialog]);
  async function install() {
    if (prompting) return;
    const event = promptRef.current;
    if (!event) { setDialog('install'); return; }
    setPrompting(true);
    // An install event is single-use. Only request it in direct response to this click.
    promptRef.current = null; window.pixelpdfInstallPrompt = null; setCanPrompt(false);
    try {
      await event.prompt(); const choice = await event.userChoice;
      if (choice.outcome === 'accepted') { setInstalled(true); prepareOffline(); }
    } catch { setDialog('install'); }
    finally { if (mounted.current) setPrompting(false); }
  }
  function applyUpdate() {
    const next = registration.current?.waiting;
    if (!next) { setDialog(null); setUpdateReady(false); return; }
    reloading.current = true; next.postMessage({ type: 'SKIP_WAITING' });
  }
  const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);
  return <>
    <div className="border-t border-slate-100 bg-gradient-to-r from-violet-50/70 via-white to-blue-50/50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="hidden min-[420px]:inline">{appMode ? 'Your document workspace' : 'All your PDF tools. One app.'}</span><span className="min-[420px]:hidden">PixelPDF</span>
          {offline === 'ready' && <span className="font-semibold text-emerald-700">Offline ready</span>}
          {!online && <span className="font-semibold text-amber-700">Offline</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {updateReady && <button type="button" onClick={() => setDialog('update')} className="rounded-lg px-2 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">Update available</button>}
          {installed ? <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700"><ShieldCheck size={13} />{appMode ? 'App mode' : 'Installed'}</span> :
            <button ref={installButton} type="button" onClick={install} disabled={prompting} aria-label="Install PixelPDF app" title={canPrompt ? 'Install PixelPDF on this device' : 'How to install PixelPDF on this device'} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-700 focus-visible:ring-4 focus-visible:ring-violet-200 disabled:opacity-60"><Download size={14} />{prompting ? 'Opening…' : 'Install app'}</button>}
          {installed && offline !== 'ready' && offline !== 'preparing' && <button type="button" onClick={prepareOffline} className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-600">Prepare offline</button>}
        </div>
      </div>
      {offline === 'preparing' && <div role="status" aria-live="polite" className="mx-auto max-w-7xl px-3 pb-2 text-xs text-slate-500 sm:px-6 lg:px-8">Preparing offline tools · {progress}%<div role="progressbar" aria-label="Offline tools download" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="mt-1 h-1 overflow-hidden rounded-full bg-violet-100"><div style={{width: `${progress}%`}} className="h-full bg-violet-500" /></div></div>}
      {message && <p role="status" className="mx-auto max-w-7xl px-3 pb-2 text-xs text-amber-800 sm:px-6 lg:px-8">{message}</p>}
    </div>
    {dialog && <dialog ref={panel} aria-labelledby="install-title" onCancel={event => { event.preventDefault(); setDialog(null); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setDialog(null); } }} className="fixed max-h-[85dvh] w-[calc(100%_-_32px)] max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 text-slate-800 shadow-2xl sm:p-7">
      <div className="flex items-center justify-between gap-3"><div className="rounded-2xl bg-violet-50 p-3 text-violet-600"><Download size={24} /></div><button type="button" autoFocus aria-label="Close installation help" onClick={() => setDialog(null)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div>
      <h2 id="install-title" className="mt-4 text-2xl font-bold tracking-tight">{dialog === 'update' ? 'A fresh PixelPDF is ready' : 'PixelPDF, one tap away'}</h2>
      {dialog === 'update' ? <><p className="mt-3 text-sm text-slate-600">Updating reloads this window. Export any unsaved documents first.</p><button type="button" onClick={applyUpdate} className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white">Update and reload</button></> : <>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">Keep every PDF tool together in an app window. Scan, convert and sign documents privately on your device.</p>
        <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
          {appleMobile ? <><li>Open this site in Safari, then tap Share.</li><li>Choose Add to Home Screen, enable Open as Web App if shown, then tap Add.</li><li>Open PixelPDF from its new home screen icon.</li></> : safari ? <><li>Open the Safari File menu.</li><li>Choose Add to Dock, then confirm Add.</li><li>Launch PixelPDF from the Dock.</li></> : <><li>Open your browser menu or the install icon beside the address bar.</li><li>Choose Install PixelPDF, Install app or Add to Home Screen.</li><li>If that option is absent, try Chrome or Edge over HTTPS. The browser decides when installation is available.</li></>}
        </ol>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold">Keep tools ready offline</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Download the scan engine and five language packs once (about 50 MB). Wait for Offline ready before disconnecting. Device storage may be cleared by your browser.</p><button type="button" onClick={prepareOffline} disabled={offline === 'preparing' || offline === 'ready'} className="mt-3 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-60">{offline === 'ready' ? 'Offline ready' : offline === 'preparing' ? `Preparing ${progress}%` : 'Prepare offline tools'}</button></div>
      </>}
      <button type="button" onClick={() => setDialog(null)} className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600">{dialog === 'update' ? 'Keep working' : 'Keep using the website'}</button>
    </dialog>}
  </>;
}

function ActiveTool({ activeTab }) {
  switch (activeTab) {
    case 'scan': return <DocumentWorkspace key="scan" />;
    case 'extract': return <DocumentWorkspace key="extract" kind="extract" />;
    case 'image': return <ImageToPdf />;
    case 'signature': return <DigitalSignaturePdf />;
    case 'freehand': return <FreehandPad />;
    case 'mergesplit': return <MergeSplitPdf />;
    case 'compressor': return <ImageCompressor />;
    case 'pdftoimage': return <PdfToImage />;
    default: return <TextToPdf />;
  }
}

export default function App() {
  // 1. Detect path from URL on first load
  const [activeTab, setActiveTab] = useState(() => {
    const currentPath = window.location.pathname;
    return pathToTab[currentPath] || 'text';
  });

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];
  const CurrentIcon = currentTab.icon;

  const primaryTabs = tabs.slice(0, 3);
  const overflowTabs = tabs.slice(3);

  // 2. Keep browser URL in sync when tabs are switched
  const selectTab = (id) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
    setDropdownOpen(false);
    if (tabToPath[id]) {
      if (window.location.pathname !== tabToPath[id]) window.history.pushState(null, '', tabToPath[id]);
    }
  };

  // 3. Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const tab = pathToTab[window.location.pathname];
      setActiveTab(tab || 'text');
      setMobileMenuOpen(false);
      setDropdownOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') { setMobileMenuOpen(false); setDropdownOpen(false); }
    };
    const breakpoint = window.matchMedia?.('(min-width: 1024px)');
    const closeMenus = () => { setMobileMenuOpen(false); setDropdownOpen(false); };
    document.addEventListener('keydown', onKey);
    breakpoint?.addEventListener?.('change', closeMenus);
    return () => {
      document.removeEventListener('keydown', onKey);
      breakpoint?.removeEventListener?.('change', closeMenus);
    };
  }, []);

  // Close overflow dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);


  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[radial-gradient(circle_at_top_left,_rgba(124,58,237,.08),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(37,99,235,.08),_transparent_30%)] flex flex-col font-sans">
      {/* Sticky Universal Header */}
      <header style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-3 py-2.5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center justify-between gap-2">
            {/* Brand Logo & Name */}
            <div
              className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 cursor-pointer"
              role="button" tabIndex={0}
              aria-label="PixelPDF home"
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectTab('text'); } }}
              onClick={() => selectTab('text')}
            >
              <img
                src={`${process.env.PUBLIC_URL}/logo.png`}
                alt="PixelPDF logo"
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl object-contain shadow-xs shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 leading-tight">
                  PixelPDF
                </h1>
                <p className="hidden sm:block text-[11px] text-slate-500 truncate">
                  Browser-based PDF utilities
                </p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav aria-label="Desktop tools switcher" className="hidden lg:flex min-w-0 items-center gap-1 rounded-2xl bg-slate-100 p-1">
              {/* Compact desktop navigation with the remaining tools in a menu. */}
              <div className="flex items-center gap-1">
                {primaryTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    aria-current={activeTab === id ? 'page' : undefined}
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

                {/* More Tools Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    aria-expanded={dropdownOpen}
                    aria-controls="desktop-more-tools"
                    className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                      overflowTabs.some((t) => t.id === activeTab)
                        ? 'bg-violet-50 text-violet-700 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    <span>
                      {overflowTabs.find((t) => t.id === activeTab)?.label || 'More Tools'}
                    </span>
                    <ChevronDown size={13} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {dropdownOpen && (
                    <div id="desktop-more-tools" className="absolute right-0 mt-2 max-h-[calc(100dvh-100px)] overflow-y-auto w-64 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg animate-in fade-in slide-in-from-top-1 z-50">
                      {overflowTabs.map(({ id, label, icon: Icon, desc }) => (
                        <button
                          key={id}
                          aria-current={activeTab === id ? 'page' : undefined}
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
                            <p className="text-[10px] text-slate-500 whitespace-normal break-words">{desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </nav>

            {/* Phone and tablet tool chooser. */}
            <div className="flex lg:hidden min-w-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-tools"
                aria-label={`Choose tool: ${currentTab.label}`}
                className="flex min-w-0 min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold text-slate-800 shadow-2xs active:bg-slate-100"
              >
                <CurrentIcon size={14} className="text-violet-600 shrink-0" />
                <span className="max-w-[96px] sm:max-w-[180px] truncate">{currentTab.label}</span>
                <ChevronDown size={13} className={`text-slate-400 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle navigation drawer"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-tools"
                className="shrink-0 min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 active:bg-slate-100"
              >
                {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>

        <InstallAppPanel />

        {/* Mobile Dropdown Grid Sheet */}
        {mobileMenuOpen && (
          <nav id="mobile-tools" aria-label="Mobile tools switcher" className="max-h-[calc(100dvh-140px)] overflow-y-auto overscroll-contain border-t border-slate-100 bg-white/95 px-3 py-3 backdrop-blur-md lg:hidden animate-in fade-in slide-in-from-top-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">
              Choose Toolkit Feature
            </p>
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 gap-2">
              {tabs.map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  aria-current={activeTab === id ? 'page' : undefined}
                  type="button"
                  onClick={() => selectTab(id)}
                  className={`flex flex-col gap-0.5 rounded-xl border p-2.5 text-left transition touch-manipulation active:scale-[0.98] ${
                    activeTab === id
                      ? 'border-violet-600 bg-violet-50/80 text-violet-900 shadow-2xs'
                      : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Icon size={14} className={activeTab === id ? 'text-violet-600' : 'text-slate-500'} />
                    <span className="text-xs font-bold whitespace-normal break-words">{label}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-normal break-words">{desc}</span>
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Main Workspace Area */}
      <main className="mx-auto max-w-7xl min-w-0 w-full px-2 sm:px-3 py-4 sm:px-6 sm:py-6 lg:px-8 flex-1">
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

        {/* Current Active Tool Component */}
        <ActiveTool activeTab={activeTab} />
      </main>

      <footer style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))' }} className="mx-auto max-w-7xl w-full px-4 pb-6 pt-2 text-center text-xs text-slate-400 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} PixelPDF · Browser-based PDF utilities
      </footer>
    </div>
  );
}