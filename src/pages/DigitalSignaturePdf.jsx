import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  PenTool,
  UploadCloud,
  Type,
  FileSignature,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileUp,
  Move,
  GripHorizontal,
  Maximize2
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export default function DigitalSignaturePdf() {
  const [file, setFile] = useState(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pages, setPages] = useState([]);
  const [page, setPage] = useState(1);
  const [scaleFactor, setScaleFactor] = useState(1);
  const [viewportDims, setViewportDims] = useState({ width: 0, height: 0 });
  const [fileName, setFileName] = useState('');
  const [fileNameTouched, setFileNameTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Signature creation mode: 'draw' | 'type' | 'upload'
  const [sigMode, setSigMode] = useState('draw');
  const [sigColor, setSigColor] = useState('#1e1b4b');
  const [typedName, setTypedName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);

  // Placed signature overlays on the PDF: { id, page, dataUrl, x, y, width, height }
  const [placedSignatures, setPlacedSignatures] = useState([]);
  const [selectedSigId, setSelectedSigId] = useState(null);

  // Drawing pad ref
  const drawCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // PDF Preview refs
  const pdfCanvasRef = useRef(null);
  const wrapRef = useRef(null);

  // Drag-and-Drop state from external tray
  const [isDragOverCanvas, setIsDragOverCanvas] = useState(false);

  // --- PDF Viewer Rendering ---
  const renderCurrentPage = useCallback(async () => {
    if (!pdf || !pdfCanvasRef.current || !wrapRef.current) return;
    const pageDoc = await pdf.getPage(page);
    const base = pageDoc.getViewport({ scale: 1 });
    const containerWidth = wrapRef.current.clientWidth || 800;
    const fitScale = Math.min((containerWidth - 24) / base.width, 1.4);
    setScaleFactor(fitScale);

    const viewport = pageDoc.getViewport({ scale: fitScale });
    setViewportDims({ width: viewport.width, height: viewport.height });

    const canvas = pdfCanvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    await pageDoc.render({ canvasContext: ctx, viewport }).promise;
  }, [pdf, page]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  const loadPdf = async (f) => {
    if (!f || f.type !== 'application/pdf') return;
    setFile(f);
    setFileName(`${f.name.replace(/\.pdf$/i, '')}-signed`);
    setPlacedSignatures([]);

    const originalBuffer = await f.arrayBuffer();
    // Clone buffer so pdf.js worker transfer does NOT detach original
    const pdfJsCopy = originalBuffer.slice(0);
    setPdfBytes(originalBuffer);

    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfJsCopy) }).promise;
    setPdf(doc);
    setPages(Array.from({ length: doc.numPages }, (_, i) => i + 1));
    setPage(1);
  };

  // --- Draw Canvas Handlers ---
  const startDrawing = (e) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = sigColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const drawMove = (e) => {
    if (!isDrawing) return;
    const canvas = drawCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = drawCanvasRef.current;
    if (canvas) setSignatureDataUrl(canvas.toDataURL('image/png'));
  };

  const clearDrawing = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl(null);
  };

  // Convert Typed Name to Signature Image
  const generateTypedSignature = (text, color) => {
    setTypedName(text);
    if (!text.trim()) {
      setSignatureDataUrl(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'italic 44px "Brush Script MT", "Caveat", "Segoe Script", cursive, sans-serif';
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 20, 60);
    setSignatureDataUrl(canvas.toDataURL('image/png'));
  };

  // Upload image signature
  const handleUploadSignature = (e) => {
    const fileItem = e.target.files?.[0];
    if (!fileItem) return;
    const reader = new FileReader();
    reader.onload = () => setSignatureDataUrl(reader.result);
    reader.readAsDataURL(fileItem);
  };

  // Stamp signature onto current page
  const placeSignatureOnDoc = (initialX = 60, initialY = 60, width = 140, height = 60) => {
    if (!signatureDataUrl) return;
    const newSig = {
      id: crypto.randomUUID(),
      page,
      dataUrl: signatureDataUrl,
      x: initialX,
      y: initialY,
      width,
      height,
    };
    setPlacedSignatures((prev) => [...prev, newSig]);
    setSelectedSigId(newSig.id);
  };

  // Drag in from external tray
  const handleDropOnCanvas = (e) => {
    e.preventDefault();
    setIsDragOverCanvas(false);
    if (!wrapRef.current || !signatureDataUrl) return;

    const wrapRect = wrapRef.current.getBoundingClientRect();
    const dropX = Math.max(0, Math.min(wrapRect.width - 140, e.clientX - wrapRect.left - 70));
    const dropY = Math.max(0, Math.min(wrapRect.height - 60, e.clientY - wrapRect.top - 30));

    placeSignatureOnDoc(Math.round(dropX), Math.round(dropY));
  };

  // Drag & Move signature within the canvas
  const handleMouseDownOnSignature = (sig, e) => {
    e.stopPropagation();
    setSelectedSigId(sig.id);

    const startX = e.clientX || e.touches?.[0]?.clientX;
    const startY = e.clientY || e.touches?.[0]?.clientY;
    const initialItemX = sig.x;
    const initialItemY = sig.y;

    const onMove = (moveEvt) => {
      if (!wrapRef.current) return;
      const curX = moveEvt.clientX || moveEvt.touches?.[0]?.clientX;
      const curY = moveEvt.clientY || moveEvt.touches?.[0]?.clientY;
      const deltaX = curX - startX;
      const deltaY = curY - startY;

      const wrapRect = wrapRef.current.getBoundingClientRect();
      const maxX = wrapRect.width - sig.width;
      const maxY = wrapRect.height - sig.height;

      setPlacedSignatures((prev) =>
        prev.map((s) =>
          s.id === sig.id
            ? {
                ...s,
                x: Math.max(0, Math.min(maxX, Math.round(initialItemX + deltaX))),
                y: Math.max(0, Math.min(maxY, Math.round(initialItemY + deltaY))),
              }
            : s
        )
      );
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
  };

  // Drag to Resize signature (Corner handle)
  const handleResizeStart = (sig, e) => {
    e.stopPropagation();
    const startX = e.clientX || e.touches?.[0]?.clientX;
    const startY = e.clientY || e.touches?.[0]?.clientY;
    const initialW = sig.width;
    const initialH = sig.height;

    const onMove = (moveEvt) => {
      const curX = moveEvt.clientX || moveEvt.touches?.[0]?.clientX;
      const curY = moveEvt.clientY || moveEvt.touches?.[0]?.clientY;
      const newWidth = Math.max(50, Math.min(450, initialW + (curX - startX)));
      const newHeight = Math.max(25, Math.min(250, initialH + (curY - startY)));

      setPlacedSignatures((prev) =>
        prev.map((s) => (s.id === sig.id ? { ...s, width: Math.round(newWidth), height: Math.round(newHeight) } : s))
      );
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
  };

  // Export Signed PDF (Protected with sliced clone buffer)
  const exportSignedPdf = async () => {
    if (!pdfBytes || !placedSignatures.length) return;
    if (!fileName.trim()) {
      setFileNameTouched(true);
      return;
    }

    setBusy(true);
    try {
      // Slicing guarantees buffer has not been detached
      const safeBuffer = pdfBytes.slice(0);
      const doc = await PDFDocument.load(safeBuffer, { ignoreEncryption: true });
      const pageObjs = doc.getPages();

      for (const sig of placedSignatures) {
        const targetPage = pageObjs[sig.page - 1];
        if (!targetPage) continue;
        const { height } = targetPage.getSize();

        // Convert dataURL to safe byte array
        const response = await fetch(sig.dataUrl);
        const imageBuffer = await response.arrayBuffer();

        let embeddedImage;
        try {
          embeddedImage = await doc.embedPng(imageBuffer);
        } catch {
          embeddedImage = await doc.embedJpg(imageBuffer);
        }

        const factor = scaleFactor || 1;
        const normX = sig.x / factor;
        const normY = sig.y / factor;
        const normW = sig.width / factor;
        const normH = sig.height / factor;

        targetPage.drawImage(embeddedImage, {
          x: normX,
          y: height - normY - normH,
          width: normW,
          height: normH,
        });
      }

      const out = await doc.save();
      const blob = new Blob([out], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.trim().replace(/\.pdf$/i, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setBusy(false);
    }
  };

  const currentSigs = placedSignatures.filter((s) => s.page === page);

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_360px] items-start w-full">
      {/* PDF Viewport Workstation */}
      <div className="panel overflow-hidden border border-slate-200/80 shadow-xs flex flex-col">
        <div className="border-b border-slate-100 p-4 sm:p-5 bg-slate-50/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Digital Signature</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Drag in signatures, resize to choice, reposition freely, or remove as needed.
              </p>
            </div>
            {file && (
              <button
                type="button"
                className="btn-secondary self-start sm:self-auto text-xs py-1.5 px-3"
                onClick={() => {
                  setFile(null);
                  setPdf(null);
                  setPdfBytes(null);
                  setPlacedSignatures([]);
                }}
              >
                <FileUp size={14} /> Change Document
              </button>
            )}
          </div>
        </div>

        {!file ? (
          <label className="m-4 sm:m-8 block cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-8 sm:p-14 text-center hover:border-violet-400 hover:bg-violet-50/40 transition">
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => loadPdf(e.target.files?.[0])} />
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
              <UploadCloud className="text-violet-600" size={30} />
            </div>
            <p className="mt-4 font-bold text-slate-800">Upload a PDF to sign</p>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">Draw, type, or drag and place your signature directly.</p>
          </label>
        ) : (
          <div className="bg-slate-100/90 p-2 sm:p-5 flex flex-col items-center select-none overflow-x-auto">
            <div
              ref={wrapRef}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOverCanvas(true);
              }}
              onDragLeave={() => setIsDragOverCanvas(false)}
              onDrop={handleDropOnCanvas}
              className={`relative max-w-full overflow-hidden rounded-xl border bg-white shadow-md touch-none transition-all ${
                isDragOverCanvas ? 'border-violet-600 ring-4 ring-violet-200/60' : 'border-slate-300'
              }`}
              style={{
                width: viewportDims.width || 'auto',
                height: viewportDims.height || 'auto',
              }}
            >
              <canvas ref={pdfCanvasRef} className="block select-none pointer-events-none" />

              {/* Render Placed Signatures on this page with Drag & Resize handles */}
              {currentSigs.map((sig) => (
                <div
                  key={sig.id}
                  onMouseDown={(e) => handleMouseDownOnSignature(sig, e)}
                  onTouchStart={(e) => handleMouseDownOnSignature(sig, e)}
                  style={{
                    left: `${sig.x}px`,
                    top: `${sig.y}px`,
                    width: `${sig.width}px`,
                    height: `${sig.height}px`,
                  }}
                  className={`absolute group cursor-move select-none p-1 border-2 rounded-lg bg-white/40 backdrop-blur-2xs transition-shadow ${
                    selectedSigId === sig.id
                      ? 'border-violet-600 ring-2 ring-violet-200 z-20'
                      : 'border-dashed border-violet-400 z-10'
                  }`}
                >
                  <img src={sig.dataUrl} alt="Signature" className="h-full w-full object-contain pointer-events-none" />

                  {/* Remove Handle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlacedSignatures((v) => v.filter((s) => s.id !== sig.id));
                    }}
                    className="absolute -top-2.5 -right-2.5 bg-red-600 text-white rounded-full p-1 shadow-sm hover:bg-red-700 transition"
                    title="Remove signature"
                  >
                    <Trash2 size={11} />
                  </button>

                  {/* Bottom-right Corner Resize Handle (Drag Out / Drag In) */}
                  <div
                    onMouseDown={(e) => handleResizeStart(sig, e)}
                    onTouchStart={(e) => handleResizeStart(sig, e)}
                    className="absolute -bottom-2 -right-2 bg-violet-600 text-white rounded-full p-1 shadow-md cursor-se-resize hover:bg-violet-700 hover:scale-110 transition"
                    title="Drag to resize signature"
                  >
                    <Maximize2 size={10} className="rotate-90" />
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="mt-4 flex items-center justify-between sm:justify-center gap-2 w-full max-w-sm">
              <button
                type="button"
                className="btn-secondary flex-1 sm:flex-none px-3 py-1.5 text-xs"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span className="text-xs font-semibold text-slate-700 px-2">
                Page {page} of {pages.length}
              </span>
              <button
                type="button"
                className="btn-secondary flex-1 sm:flex-none px-3 py-1.5 text-xs"
                onClick={() => setPage((p) => Math.min(pages.length, p + 1))}
                disabled={page >= pages.length}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Signature Creator Sidebar */}
      <aside className="panel p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <FileSignature size={18} className="text-violet-600" /> Signature Creator
        </h3>

        {/* Mode Selector */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setSigMode('draw')}
            className={`py-1.5 text-xs font-semibold rounded-lg transition ${
              sigMode === 'draw' ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => setSigMode('type')}
            className={`py-1.5 text-xs font-semibold rounded-lg transition ${
              sigMode === 'type' ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Type
          </button>
          <button
            type="button"
            onClick={() => setSigMode('upload')}
            className={`py-1.5 text-xs font-semibold rounded-lg transition ${
              sigMode === 'upload' ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Upload
          </button>
        </div>

        {/* DRAW MODE */}
        {sigMode === 'draw' && (
          <div className="space-y-3">
            <div className="relative rounded-xl border border-slate-300 bg-white shadow-inner overflow-hidden">
              <canvas
                ref={drawCanvasRef}
                width={320}
                height={130}
                onMouseDown={startDrawing}
                onMouseMove={drawMove}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={drawMove}
                onTouchEnd={stopDrawing}
                className="w-full h-32 block cursor-crosshair touch-none"
              />
              <span className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] text-slate-400 font-mono">
                Sign above
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={sigColor}
                  onChange={(e) => setSigColor(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded-lg border border-slate-200 p-0.5"
                  title="Ink Color"
                />
                <span className="text-xs text-slate-500 font-medium">Ink Color</span>
              </div>
              <button
                type="button"
                onClick={clearDrawing}
                className="text-xs font-semibold text-slate-500 hover:text-red-600"
              >
                Clear Pad
              </button>
            </div>
          </div>
        )}

        {/* TYPE MODE */}
        {sigMode === 'type' && (
          <div className="space-y-3">
            <input
              type="text"
              value={typedName}
              onChange={(e) => generateTypedSignature(e.target.value, sigColor)}
              placeholder="Type your name or initials…"
              className="field w-full text-sm"
            />
            {signatureDataUrl && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-2xs">
                <img src={signatureDataUrl} alt="Typed Signature" className="mx-auto max-h-16" />
              </div>
            )}
          </div>
        )}

        {/* UPLOAD MODE */}
        {sigMode === 'upload' && (
          <div>
            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center hover:border-violet-400 transition">
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleUploadSignature} className="hidden" />
              <UploadCloud size={24} className="mx-auto text-violet-600" />
              <p className="mt-2 text-xs font-semibold text-slate-700">Upload signature image</p>
              <p className="text-[10px] text-slate-400">PNG with transparent background recommended</p>
            </label>
          </div>
        )}

        {/* Drag-in Signature Tray */}
        {signatureDataUrl && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-violet-950 flex items-center gap-1.5">
                <GripHorizontal size={14} className="text-violet-600" /> Drag In to Document
              </span>
              <span className="text-[10px] text-violet-600 font-medium">Drag or Click button</span>
            </div>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', 'signature');
              }}
              className="group relative cursor-grab active:cursor-grabbing rounded-lg border border-dashed border-violet-400 bg-white p-2.5 text-center shadow-2xs hover:border-violet-600 transition"
              title="Drag this signature directly onto the PDF"
            >
              <img src={signatureDataUrl} alt="Ready Signature" className="mx-auto max-h-14 object-contain" />
              <span className="mt-1 block text-[10px] font-medium text-slate-400 group-hover:text-violet-600">
                Hold & Drag onto any PDF page
              </span>
            </div>
          </div>
        )}

        {/* Stamp Signature Onto Page */}
        <button
          type="button"
          onClick={() => placeSignatureOnDoc()}
          disabled={!file || !signatureDataUrl}
          className="btn-primary w-full justify-center text-sm py-2"
        >
          <Move size={15} /> Stamp onto Page {page}
        </button>

        {/* Document Renaming & Final Export */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Export Document Name *</span>
            <div className="relative flex items-center">
              <input
                type="text"
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value);
                  if (!fileNameTouched) setFileNameTouched(true);
                }}
                placeholder="e.g. contract-signed"
                className={`field w-full pr-12 text-sm ${
                  fileNameTouched && !fileName.trim() ? 'border-red-400 focus:border-red-500' : ''
                }`}
              />
              <span className="pointer-events-none absolute right-3 text-xs font-semibold text-slate-400">.pdf</span>
            </div>
          </label>

          {fileNameTouched && !fileName.trim() && (
            <p className="flex items-center gap-1 text-xs text-red-600 font-medium">
              <AlertCircle size={13} /> Name your document before downloading.
            </p>
          )}

          <button
            type="button"
            onClick={exportSignedPdf}
            disabled={!file || !placedSignatures.length || !fileName.trim() || busy}
            className="btn-primary w-full justify-center text-sm py-2.5"
          >
            <Download size={15} />
            {busy ? 'Embedding Signatures…' : 'Download Signed PDF'}
          </button>
        </div>
      </aside>
    </section>
  );
}