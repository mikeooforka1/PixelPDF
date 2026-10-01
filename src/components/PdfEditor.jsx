import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Download,
  FileUp,
  LoaderCircle,
  Plus,
  Trash2,
  Type,
  UploadCloud,
  FilePenLine,
  ChevronLeft,
  ChevronRight,
  Check,
  Edit3,
  Layers
} from 'lucide-react';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const fileToBytes = (file) => file.arrayBuffer();

export default function PdfEditor() {
  const [file, setFile] = useState(null);
  const [customName, setCustomName] = useState('');
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pages, setPages] = useState([]);
  const [page, setPage] = useState(1);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [viewportDims, setViewportDims] = useState({ width: 0, height: 0 });

  // Extracted existing text from the PDF
  const [extractedItems, setExtractedItems] = useState([]);
  // Overlays / edits made to original text or added items
  const [overlays, setOverlays] = useState([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState(null);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    text: '',
    x: 40,
    y: 40,
    size: 14,
    color: '#000000',
    opacity: 100,
    rotate: 0,
    isExistingEdit: false,
    originalWidth: 0,
    originalHeight: 0,
  });

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  // Extract page content & render canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || !wrapRef.current) return;
    setLoading(true);
    try {
      const pageDoc = await pdf.getPage(page);
      const base = pageDoc.getViewport({ scale: 1 });
      const containerWidth = wrapRef.current.clientWidth || 800;
      // Allow scale up to 1.5x on desktop, fit nicely on mobile screens
      const fitScale = Math.min((containerWidth - 24) / base.width, 1.4);
      setScaleFactor(fitScale);

      const viewport = pageDoc.getViewport({ scale: fitScale });
      setViewportDims({ width: viewport.width, height: viewport.height });

      const canvas = canvasRef.current;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      await pageDoc.render({ canvasContext: ctx, viewport }).promise;

      // Extract existing text elements on this page
      const textContent = await pageDoc.getTextContent();
      const items = textContent.items
        .filter((item) => item.str && item.str.trim().length > 0)
        .map((item, idx) => {
          // Transform PDF matrix coordinates to viewport pixels
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]);
          const x = tx[4];
          const y = tx[5] - fontHeight; // convert baseline to top coordinate

          return {
            id: `orig-${page}-${idx}`,
            page,
            originalText: item.str,
            text: item.str,
            x: Math.round(x),
            y: Math.max(0, Math.round(y)),
            width: Math.round(item.width * fitScale),
            height: Math.max(14, Math.round(fontHeight)),
            size: Math.max(10, Math.round(fontHeight)),
          };
        });

      setExtractedItems(items);
    } finally {
      setLoading(false);
    }
  }, [pdf, page]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => {
      if (pdf) renderCurrentPage();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pdf, renderCurrentPage]);

  const load = async (f) => {
    if (!f || f.type !== 'application/pdf') return;
    setFile(f);
    setCustomName(f.name.replace(/\.pdf$/i, ''));
    setLoading(true);
    setOverlays([]);
    setSelectedOverlayId(null);

    const bytes = await fileToBytes(f);
    setPdfBytes(bytes);
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    setPdf(doc);
    setPages(Array.from({ length: doc.numPages }, (_, i) => i + 1));
    setPage(1);
    setLoading(false);
  };

  // Start editing existing text extracted from PDF
  const editOriginalText = (item) => {
    // Check if there is already an existing edit overlay for this item
    const existing = overlays.find((o) => o.targetId === item.id);
    if (existing) {
      setSelectedOverlayId(existing.id);
      setForm({
        text: existing.text,
        x: existing.x,
        y: existing.y,
        size: existing.size,
        color: existing.color,
        opacity: Math.round(existing.opacity * 100),
        rotate: existing.rotate,
        isExistingEdit: true,
        originalWidth: existing.originalWidth,
        originalHeight: existing.originalHeight,
      });
    } else {
      const newOverlayId = crypto.randomUUID();
      const newOverlay = {
        id: newOverlayId,
        targetId: item.id,
        page,
        text: item.text,
        x: item.x,
        y: item.y,
        size: item.size,
        color: '#000000',
        opacity: 1,
        rotate: 0,
        scaleFactor,
        isExistingEdit: true,
        originalWidth: Math.max(item.width + 4, 20),
        originalHeight: Math.max(item.height + 2, 14),
      };
      setOverlays((v) => [...v, newOverlay]);
      setSelectedOverlayId(newOverlayId);
      setForm({
        text: item.text,
        x: item.x,
        y: item.y,
        size: item.size,
        color: '#000000',
        opacity: 100,
        rotate: 0,
        isExistingEdit: true,
        originalWidth: item.width + 4,
        originalHeight: item.height + 2,
      });
    }
  };

  const handleCanvasClick = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = Math.round(e.clientX - rect.left);
    const clickY = Math.round(e.clientY - rect.top);

    setSelectedOverlayId(null);
    setForm({
      text: 'New Note',
      x: clickX,
      y: clickY,
      size: 14,
      color: '#2563eb',
      opacity: 100,
      rotate: 0,
      isExistingEdit: false,
      originalWidth: 0,
      originalHeight: 0,
    });
  };

  const saveFormOverlay = () => {
    if (!form.text.trim()) return;

    if (selectedOverlayId) {
      setOverlays((prev) =>
        prev.map((o) =>
          o.id === selectedOverlayId
            ? {
                ...o,
                text: form.text,
                x: Number(form.x),
                y: Number(form.y),
                size: Number(form.size),
                color: form.color,
                opacity: Number(form.opacity) / 100,
                rotate: Number(form.rotate),
                scaleFactor,
                isExistingEdit: form.isExistingEdit,
                originalWidth: form.originalWidth,
                originalHeight: form.originalHeight,
              }
            : o
        )
      );
    } else {
      const newId = crypto.randomUUID();
      setOverlays((v) => [
        ...v,
        {
          id: newId,
          page,
          text: form.text,
          x: Number(form.x),
          y: Number(form.y),
          size: Number(form.size),
          color: form.color,
          opacity: Number(form.opacity) / 100,
          rotate: Number(form.rotate),
          scaleFactor,
          isExistingEdit: false,
          originalWidth: 0,
          originalHeight: 0,
        },
      ]);
      setSelectedOverlayId(newId);
    }
  };

  const removeOverlay = (id) => {
    setOverlays((v) => v.filter((o) => o.id !== id));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  const exportPdf = async () => {
    if (!pdfBytes) return;
    setBusy(true);
    try {
      const doc = await PDFDocument.load(pdfBytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pageSizes = doc.getPages();

      for (const o of overlays) {
        const p = pageSizes[o.page - 1];
        if (!p) continue;

        const { height } = p.getSize();
        const factor = o.scaleFactor || 1;
        const normalizedX = o.x / factor;
        const normalizedY = o.y / factor;
        const normalizedSize = o.size / factor;

        // If this is an existing text edit, white-out the original text first
        if (o.isExistingEdit && o.originalWidth && o.originalHeight) {
          const normW = o.originalWidth / factor;
          const normH = o.originalHeight / factor;
          p.drawRectangle({
            x: normalizedX - 1,
            y: height - normalizedY - normH,
            width: normW + 3,
            height: normH + 2,
            color: rgb(1, 1, 1),
            opacity: 1,
          });
        }

        const hex = o.color.replace('#', '');
        const c = rgb(
          parseInt(hex.slice(0, 2), 16) / 255,
          parseInt(hex.slice(2, 4), 16) / 255,
          parseInt(hex.slice(4, 6), 16) / 255
        );

        p.drawText(o.text, {
          x: normalizedX,
          y: height - normalizedY - normalizedSize,
          size: normalizedSize,
          font,
          color: c,
          opacity: o.opacity,
          rotate: degrees(o.rotate),
        });
      }

      const out = await doc.save();
      const blob = new Blob([out], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const exportName = (customName.trim() || 'edited-document').replace(/\.pdf$/i, '');
      a.download = `${exportName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  const currentOverlays = overlays.filter((o) => o.page === page);
  const currentExtracted = extractedItems.filter((i) => i.page === page);

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_360px] items-start w-full">
      {/* PDF Viewport Container */}
      <div className="panel overflow-hidden border border-slate-200/80 shadow-xs flex flex-col">
        {/* Header / Document Name */}
        <div className="border-b border-slate-100 p-4 sm:p-5 bg-slate-50/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">PDF Editor</h2>
              {file ? (
                <div className="mt-2 flex items-center gap-2 max-w-sm">
                  <FilePenLine size={15} className="text-violet-600 shrink-0" />
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="field py-1 px-2.5 text-xs sm:text-sm font-semibold text-slate-800"
                    placeholder="Document name"
                  />
                  <span className="text-xs text-slate-400 font-medium">.pdf</span>
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-slate-500">Tap or click any text in the PDF to edit it directly.</p>
              )}
            </div>

            {file && (
              <button
                type="button"
                className="btn-secondary self-start sm:self-auto shrink-0 text-xs sm:text-sm py-1.5 px-3"
                onClick={() => {
                  setFile(null);
                  setPdf(null);
                  setPdfBytes(null);
                  setPages([]);
                  setOverlays([]);
                  setExtractedItems([]);
                }}
              >
                <FileUp size={14} /> Change File
              </button>
            )}
          </div>
        </div>

        {!file ? (
          <label className="m-4 sm:m-8 block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-8 sm:p-14 text-center hover:border-violet-400 hover:bg-violet-50/40 transition">
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
              <UploadCloud className="text-violet-600" size={30} />
            </div>
            <p className="mt-4 font-bold text-slate-800">Upload a PDF to start editing</p>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">Edit existing words or stamp new annotations.</p>
          </label>
        ) : (
          <div className="bg-slate-100/90 p-2 sm:p-5 flex flex-col items-center select-none overflow-x-auto">
            <div className="mb-2 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5 px-2">
              <Edit3 size={13} className="text-violet-600 shrink-0" />
              <span>Click on any text on the page to edit, or click empty space to add new text</span>
            </div>

            {/* Canvas + Interactive Overlays Layer */}
            <div
              ref={wrapRef}
              onClick={handleCanvasClick}
              className="relative max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-md cursor-crosshair touch-pan-x touch-pan-y"
              style={{
                width: viewportDims.width || 'auto',
                height: viewportDims.height || 'auto',
              }}
            >
              <canvas ref={canvasRef} className="block select-none pointer-events-none" />

              {/* Extracted Existing Text Layer (Clickable hotspots over existing text) */}
              {currentExtracted.map((item) => {
                const isOverridden = currentOverlays.some((o) => o.targetId === item.id);
                if (isOverridden) return null; // Hidden by an active edit overlay

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      editOriginalText(item);
                    }}
                    className="absolute bg-violet-500/0 hover:bg-violet-500/15 focus:bg-violet-500/25 active:bg-violet-500/30 rounded cursor-pointer transition border border-transparent hover:border-violet-300"
                    style={{
                      left: item.x - 1,
                      top: item.y - 1,
                      width: item.width + 2,
                      height: item.height + 2,
                    }}
                    title={`Click to edit: "${item.text}"`}
                  />
                );
              })}

              {/* Active User Edits and Overlays */}
              {currentOverlays.map((o) => (
                <div
                  key={o.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOverlayId(o.id);
                    setForm({
                      text: o.text,
                      x: o.x,
                      y: o.y,
                      size: o.size,
                      color: o.color,
                      opacity: Math.round(o.opacity * 100),
                      rotate: o.rotate,
                      isExistingEdit: o.isExistingEdit,
                      originalWidth: o.originalWidth,
                      originalHeight: o.originalHeight,
                    });
                  }}
                  className={`absolute cursor-pointer px-1 py-0.5 rounded font-sans transition-all leading-none ${
                    selectedOverlayId === o.id
                      ? 'ring-2 ring-violet-600 bg-white shadow-sm z-20'
                      : o.isExistingEdit
                      ? 'bg-white text-slate-900 shadow-2xs z-10'
                      : 'hover:ring-1 hover:ring-slate-400 z-10'
                  }`}
                  style={{
                    left: o.x,
                    top: o.y,
                    fontSize: `${o.size}px`,
                    color: o.color,
                    opacity: o.opacity,
                    transform: `rotate(${o.rotate}deg)`,
                    transformOrigin: 'left top',
                  }}
                >
                  {o.text}
                </div>
              ))}

              {loading && (
                <div className="absolute inset-0 grid place-items-center bg-white/80 backdrop-blur-xs">
                  <LoaderCircle className="animate-spin text-violet-600" size={32} />
                </div>
              )}
            </div>

            {/* Mobile-Friendly Page Navigation */}
            <div className="mt-4 flex items-center justify-between sm:justify-center gap-2 w-full max-w-sm">
              <button
                type="button"
                className="btn-secondary flex-1 sm:flex-none px-3 py-1.5 text-xs justify-center"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="text-xs font-semibold text-slate-700 whitespace-nowrap px-2">
                Page {page} of {pages.length}
              </span>
              <button
                type="button"
                className="btn-secondary flex-1 sm:flex-none px-3 py-1.5 text-xs justify-center"
                onClick={() => setPage((p) => Math.min(pages.length, p + 1))}
                disabled={page >= pages.length}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Editor Controls Sidebar */}
      <aside className="panel p-4 sm:p-6 border border-slate-200/80 shadow-xs">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Type size={18} className="text-violet-600" />
          {form.isExistingEdit ? 'Edit PDF Text' : selectedOverlayId ? 'Edit Added Text' : 'Text Tools'}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          {form.isExistingEdit
            ? 'Updating this replaces the original text seamlessly with white-out redaction.'
            : 'Type text below and click apply or tap anywhere on the canvas.'}
        </p>

        <div className="mt-4 space-y-3.5">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
            Text Content
            <input
              className="field mt-1.5 w-full text-sm"
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="Enter text..."
            />
          </label>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="text-xs font-semibold text-slate-600">
              Font Size (px)
              <input
                className="field mt-1 w-full text-sm"
                type="number"
                min="8"
                max="80"
                value={form.size}
                onChange={(e) => setForm({ ...form, size: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Rotation (°)
              <input
                className="field mt-1 w-full text-sm"
                type="number"
                min="-180"
                max="180"
                value={form.rotate}
                onChange={(e) => setForm({ ...form, rotate: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              X Coordinate
              <input
                className="field mt-1 w-full text-sm"
                type="number"
                value={form.x}
                onChange={(e) => setForm({ ...form, x: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Y Coordinate
              <input
                className="field mt-1 w-full text-sm"
                type="number"
                value={form.y}
                onChange={(e) => setForm({ ...form, y: Number(e.target.value) })}
              />
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-600">
            Color
            <div className="mt-1 flex gap-2">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 p-1"
              />
              <input
                className="field flex-1 text-sm font-mono"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
          </label>

          <label className="block text-xs font-semibold text-slate-600">
            <span className="flex justify-between">
              <span>Opacity</span>
              <span className="text-slate-400">{form.opacity}%</span>
            </span>
            <input
              className="mt-1.5 w-full accent-violet-600"
              type="range"
              min="10"
              max="100"
              value={form.opacity}
              onChange={(e) => setForm({ ...form, opacity: Number(e.target.value) })}
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="btn-primary flex-1 justify-center text-sm py-2"
              onClick={saveFormOverlay}
              disabled={!file || !form.text.trim()}
            >
              {selectedOverlayId ? <Check size={16} /> : <Plus size={16} />}
              {selectedOverlayId ? 'Apply Changes' : `Add to Page ${page}`}
            </button>
            {selectedOverlayId && (
              <button
                type="button"
                className="btn-secondary px-3"
                onClick={() => {
                  setSelectedOverlayId(null);
                  setForm({
                    text: '',
                    x: 40,
                    y: 40,
                    size: 14,
                    color: '#000000',
                    opacity: 100,
                    rotate: 0,
                    isExistingEdit: false,
                    originalWidth: 0,
                    originalHeight: 0,
                  });
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {overlays.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Layers size={13} /> Active Edits ({overlays.length})
            </h4>
            <div className="mt-2.5 max-h-36 space-y-1.5 overflow-y-auto pr-1">
              {overlays.map((o) => (
                <div
                  key={o.id}
                  onClick={() => {
                    setSelectedOverlayId(o.id);
                    setForm({
                      text: o.text,
                      x: o.x,
                      y: o.y,
                      size: o.size,
                      color: o.color,
                      opacity: Math.round(o.opacity * 100),
                      rotate: o.rotate,
                      isExistingEdit: o.isExistingEdit,
                      originalWidth: o.originalWidth,
                      originalHeight: o.originalHeight,
                    });
                  }}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                    selectedOverlayId === o.id
                      ? 'bg-violet-100 text-violet-900 font-semibold ring-1 ring-violet-300'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <span className="truncate">
                    p.{o.page}: {o.text} {o.isExistingEdit && '(Edited)'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOverlay(o.id);
                    }}
                    className="shrink-0 text-slate-400 hover:text-red-600 p-1"
                    aria-label="Remove item"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn-primary mt-5 w-full justify-center py-2.5 text-sm"
          onClick={exportPdf}
          disabled={!file || busy}
        >
          <Download size={16} />
          {busy ? 'Exporting PDF…' : 'Download Edited PDF'}
        </button>
      </aside>
    </section>
  );
}