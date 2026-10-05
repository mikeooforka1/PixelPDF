import React, { useRef, useState, useEffect } from 'react';
import {
  Pen,
  Highlighter,
  RotateCcw,
  Download,
  FileDown,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { jsPDF } from 'jspdf';

const STORAGE_KEY_DRAWING = 'pixelpdf_freehand_draft';
const STORAGE_KEY_DRAWING_NAME = 'pixelpdf_freehand_name';

export default function FreehandPad() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#1e293b');
  const [penSize, setPenSize] = useState(3);
  const [tool, setTool] = useState('pen'); // 'pen' | 'highlighter' | 'eraser'
  const [fileName, setFileName] = useState(() => localStorage.getItem(STORAGE_KEY_DRAWING_NAME) || '');
  const [nameTouched, setNameTouched] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [busy, setBusy] = useState(false);

  // Initialize canvas and restore draft if present
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Fill white background initially
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const savedData = localStorage.getItem(STORAGE_KEY_DRAWING);
    if (savedData) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        setHasContent(true);
      };
      img.src = savedData;
    }
  }, []);

  const saveDraftToStorage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      localStorage.setItem(STORAGE_KEY_DRAWING, canvas.toDataURL('image/png'));
      setHasContent(true);
    } catch (e) {
      console.warn('Draft save error:', e);
    }
  };

  const handleFileNameChange = (e) => {
    const val = e.target.value;
    setFileName(val);
    if (!nameTouched) setNameTouched(true);
    localStorage.setItem(STORAGE_KEY_DRAWING_NAME, val);
  };

  const startDraw = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);

    if (tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = penSize * 4;
      ctx.globalAlpha = 1;
    } else if (tool === 'highlighter') {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize * 3;
      ctx.globalAlpha = 0.35;
    } else {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
      ctx.globalAlpha = 1;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const ctx = canvas.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveDraftToStorage();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    localStorage.removeItem(STORAGE_KEY_DRAWING);
    setHasContent(false);
  };

  // --- Export as PDF ---
  const exportToPdf = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContent) return;
    if (!fileName.trim()) {
      setNameTouched(true);
      return;
    }

    setBusy(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const scale = Math.min((pageW - 40) / canvas.width, (pageH - 40) / canvas.height);
      const w = canvas.width * scale;
      const h = canvas.height * scale;

      doc.addImage(imgData, 'JPEG', (pageW - w) / 2, 20, w, h);
      const clean = fileName.trim().replace(/\.pdf$/i, '');
      doc.save(`${clean}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  // --- Export as Editable DOC Format ---
  const exportToDoc = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContent) return;
    if (!fileName.trim()) {
      setNameTouched(true);
      return;
    }

    const imgData = canvas.toDataURL('image/png');
    const clean = fileName.trim().replace(/\.doc$/i, '');

    const docContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>${clean}</title></head>
      <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #333333;">Handwritten Document: ${clean}</h2>
        <p style="color: #666666; font-size: 12px;">Exported from PixelPDF Freehand Pad on ${new Date().toLocaleDateString()}</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;"/>
        <div style="text-align: center;">
          <img src="${imgData}" style="max-width: 100%; border: 1px solid #ddd; border-radius: 8px;"/>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clean}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_320px] items-start w-full">
      {/* Drawing Pad Canvas Panel */}
      <div className="panel overflow-hidden border border-slate-200/80 shadow-xs flex flex-col">
        <div className="border-b border-slate-100 p-4 sm:p-5 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Freehand Writing & Sketchpad</h2>
            <p className="text-xs sm:text-sm text-slate-500">Handwrite notes, diagrams, or signatures and export to PDF or DOC.</p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {hasContent && (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 size={12} /> Auto-Saved
              </span>
            )}
            <button
              type="button"
              onClick={clearCanvas}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-red-600 transition"
            >
              <RotateCcw size={12} /> Clear Board
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6 bg-slate-100 flex justify-center overflow-x-auto">
          <canvas
            ref={canvasRef}
            width={850}
            height={1100}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={stopDraw}
            className="rounded-xl border border-slate-300 bg-white shadow-md cursor-crosshair max-w-full touch-none"
            style={{ width: '100%', maxWidth: '850px', height: 'auto' }}
          />
        </div>
      </div>

      {/* Toolbox & Exporter Sidebar */}
      <aside className="panel p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
        <h3 className="text-base font-bold text-slate-900">Drawing Tools</h3>

        {/* Tool Switcher */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              tool === 'pen' ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-600'
            }`}
          >
            <Pen size={13} /> Pen
          </button>
          <button
            type="button"
            onClick={() => setTool('highlighter')}
            className={`flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              tool === 'highlighter' ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-600'
            }`}
          >
            <Highlighter size={13} /> Marker
          </button>
          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`py-1.5 text-xs font-semibold rounded-lg transition ${
              tool === 'eraser' ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Eraser
          </button>
        </div>

        {/* Color Palette */}
        {tool !== 'eraser' && (
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">Ink Color</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={penColor}
                onChange={(e) => setPenColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 p-1"
              />
              <div className="flex gap-1.5 flex-wrap">
                {['#0f172a', '#2563eb', '#dc2626', '#16a34a', '#ca8a04'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPenColor(c)}
                    style={{ backgroundColor: c }}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      penColor === c ? 'border-violet-600 scale-110' : 'border-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Pen Size Slider */}
        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
            <span>Stroke Size</span>
            <span className="text-slate-400">{penSize}px</span>
          </div>
          <input
            type="range"
            min="1"
            max="24"
            value={penSize}
            onChange={(e) => setPenSize(Number(e.target.value))}
            className="w-full accent-violet-600"
          />
        </div>

        {/* Export Controls */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Document Name *</span>
            <input
              type="text"
              value={fileName}
              onChange={handleFileNameChange}
              placeholder="e.g. meeting-sketch"
              className={`field w-full text-sm ${nameTouched && !fileName.trim() ? 'border-red-400' : ''}`}
            />
          </label>

          {nameTouched && !fileName.trim() && (
            <p className="flex items-center gap-1 text-xs text-red-600 font-medium">
              <AlertCircle size={13} /> Name your file before exporting.
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={exportToPdf}
              disabled={!hasContent || !fileName.trim() || busy}
              className="btn-primary w-full justify-center text-sm py-2"
            >
              <Download size={15} /> Save as PDF
            </button>
            <button
              type="button"
              onClick={exportToDoc}
              disabled={!hasContent || !fileName.trim()}
              className="btn-secondary w-full justify-center text-sm py-2"
            >
              <FileDown size={15} /> Export to Word (.doc)
            </button>
          </div>
        </div>
      </aside>
    </section>
  );
}