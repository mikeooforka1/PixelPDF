import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud,
  FileArchive,
  Download,
  Trash2,
  Sliders,
  Maximize2,
  Lock,
  Unlock,
  AlertCircle,
  FileCheck2,
  LoaderCircle
} from 'lucide-react';
import JSZip from 'jszip';

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = 2;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export default function ImageCompressor() {
  const [images, setImages] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quality, setQuality] = useState(80);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [lockAspect, setLockAspect] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewSize, setPreviewSize] = useState(0);
  const [busy, setBusy] = useState(false);
  const [zipFileName, setZipFileName] = useState('');
  const [zipNameTouched, setZipNameTouched] = useState(false);
  const inputRef = useRef(null);

  const activeImage = images[selectedIndex] || null;

  // Process incoming file uploads
  const handleUpload = (files) => {
    const valid = Array.from(files).filter((f) =>
      ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(f.type)
    );
    if (!valid.length) return;

    valid.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const item = {
            id: `${file.name}-${file.lastModified}-${Math.random()}`,
            file,
            name: file.name,
            originalSize: file.size,
            originalWidth: img.width,
            originalHeight: img.height,
            src: e.target.result,
            imageElement: img,
          };
          setImages((prev) => [...prev, item]);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  // Sync controls whenever active selected image changes
  useEffect(() => {
    if (activeImage) {
      setWidth(activeImage.originalWidth);
      setHeight(activeImage.originalHeight);
      setAspectRatio(activeImage.originalWidth / activeImage.originalHeight);
      setZipFileName('compressed-images');
    } else {
      setPreviewBlob(null);
      setPreviewSize(0);
    }
  }, [selectedIndex, activeImage]);

  // Width changed by user
  const handleWidthChange = (val) => {
    const num = Math.max(1, parseInt(val, 10) || 1);
    setWidth(num);
    if (lockAspect && aspectRatio) {
      setHeight(Math.round(num / aspectRatio));
    }
  };

  // Height changed by user
  const handleHeightChange = (val) => {
    const num = Math.max(1, parseInt(val, 10) || 1);
    setHeight(num);
    if (lockAspect && aspectRatio) {
      setWidth(Math.round(num * aspectRatio));
    }
  };

  // Render & calculate compressed preview using Canvas API
  const generatePreview = useCallback(async () => {
    if (!activeImage || !width || !height) return;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(activeImage.imageElement, 0, 0, width, height);

    const mime = activeImage.file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPreviewBlob(blob);
        setPreviewSize(blob.size);
      },
      mime,
      quality / 100
    );
  }, [activeImage, width, height, quality]);

  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  // Single file compressed download
  const downloadSingle = () => {
    if (!previewBlob || !activeImage) return;
    const url = URL.createObjectURL(previewBlob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = activeImage.name.replace(/\.[^/.]+$/, '');
    const ext = activeImage.file.type === 'image/png' ? 'png' : 'jpg';
    a.download = `${baseName}-compressed.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Batch download as .ZIP archive via JSZip
  const downloadBatchZip = async () => {
    if (!images.length) return;
    if (!zipFileName.trim()) {
      setZipNameTouched(true);
      return;
    }

    setBusy(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        const canvas = document.createElement('canvas');

        // Scale proportionally if batch dimensions were modified
        const scale = width / (activeImage?.originalWidth || item.originalWidth);
        const targetW = Math.round(item.originalWidth * (scale || 1));
        const targetH = Math.round(item.originalHeight * (scale || 1));

        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(item.imageElement, 0, 0, targetW, targetH);

        const mime = item.file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality / 100));

        const baseName = item.name.replace(/\.[^/.]+$/, '');
        const ext = item.file.type === 'image/png' ? 'png' : 'jpg';
        zip.file(`${baseName}-compressed.${ext}`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipFileName.trim().replace(/\.zip$/i, '')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_360px] items-start w-full">
      {/* Left Workspace: Upload Area & Queue */}
      <div className="panel overflow-hidden border border-slate-200/80 shadow-xs flex flex-col">
        <div className="border-b border-slate-100 p-4 sm:p-5 bg-slate-50/70">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Image Compressor</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Client-side quality reduction, precision resizing, and batch ZIP export.
              </p>
            </div>
            {images.length > 0 && (
              <span className="self-start sm:self-auto rounded-full bg-violet-50 border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700">
                {images.length} {images.length === 1 ? 'image' : 'images'}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {/* Dropzone */}
          <div
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-6 sm:p-8 text-center hover:border-violet-400 hover:bg-violet-50/40 transition"
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
              <UploadCloud className="text-violet-600" size={24} />
            </div>
            <p className="mt-3 text-sm sm:text-base font-semibold text-slate-800">
              Drop single or batch images here
            </p>
            <p className="mt-1 text-xs text-slate-500">Supports PNG, JPG, JPEG, and WebP</p>
          </div>

          {/* Active Image Visual Preview */}
          {activeImage && (
            <div className="rounded-xl border border-slate-200 bg-slate-900/5 p-4 flex flex-col items-center">
              <div className="relative max-h-72 max-w-full overflow-hidden rounded-lg shadow-sm bg-white p-2">
                <img
                  src={activeImage.src}
                  alt={activeImage.name}
                  className="max-h-64 w-auto object-contain mx-auto"
                />
              </div>

              {/* Metric Comparison Badges */}
              <div className="mt-3 grid grid-cols-2 gap-3 w-full max-w-md text-center text-xs">
                <div className="bg-white border border-slate-200 rounded-lg p-2 shadow-2xs">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Original</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {formatBytes(activeImage.originalSize)}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {activeImage.originalWidth} × {activeImage.originalHeight} px
                  </span>
                </div>
                <div className="bg-white border border-emerald-200 rounded-lg p-2 shadow-2xs">
                  <span className="text-emerald-600 block text-[10px] uppercase font-bold tracking-wider">Estimated Output</span>
                  <span className="font-bold text-emerald-700 text-sm">{formatBytes(previewSize)}</span>
                  <span className="block text-[11px] text-emerald-600 font-medium">
                    {previewSize && activeImage.originalSize > previewSize
                      ? `-${Math.round((1 - previewSize / activeImage.originalSize) * 100)}% reduced`
                      : 'Uncompressed'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Thumbnail Queue for Batch Files */}
          {images.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Selected Queue ({images.length})</span>
                <button
                  type="button"
                  onClick={() => setImages([])}
                  className="text-red-500 hover:text-red-700"
                >
                  Clear all
                </button>
              </div>

              <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedIndex(idx)}
                    className={`relative cursor-pointer rounded-xl border-2 p-1 bg-white shrink-0 transition ${
                      selectedIndex === idx
                        ? 'border-violet-600 ring-2 ring-violet-200'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <img
                      src={img.src}
                      alt={img.name}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImages((prev) => prev.filter((_, i) => i !== idx));
                        if (selectedIndex >= idx && selectedIndex > 0) {
                          setSelectedIndex((prev) => prev - 1);
                        }
                      }}
                      className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 shadow-sm hover:bg-red-700"
                      title="Remove"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Controls Panel */}
      <aside className="panel p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Sliders size={18} className="text-violet-600" /> Compression Settings
        </h3>

        {/* Quality Slider */}
        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
            <span>Compression Quality</span>
            <span className="text-violet-600 font-bold">{quality}%</span>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full accent-violet-600"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>Smallest Size</span>
            <span>Balanced</span>
            <span>Best Quality</span>
          </div>
        </div>

        {/* Dimensions Controls */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Maximize2 size={13} /> Resize Resolution
            </span>
            <button
              type="button"
              onClick={() => setLockAspect(!lockAspect)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded-md border border-violet-200"
            >
              {lockAspect ? <Lock size={11} /> : <Unlock size={11} />}
              {lockAspect ? 'Locked' : 'Unlocked'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="text-xs text-slate-600 font-medium">
              Width (px)
              <input
                type="number"
                value={width || ''}
                onChange={(e) => handleWidthChange(e.target.value)}
                disabled={!activeImage}
                className="field mt-1 w-full text-sm font-mono"
              />
            </label>
            <label className="text-xs text-slate-600 font-medium">
              Height (px)
              <input
                type="number"
                value={height || ''}
                onChange={(e) => handleHeightChange(e.target.value)}
                disabled={!activeImage}
                className="field mt-1 w-full text-sm font-mono"
              />
            </label>
          </div>
        </div>

        {/* Actions & Export */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          {/* Single Download */}
          <button
            type="button"
            onClick={downloadSingle}
            disabled={!previewBlob || !activeImage}
            className="btn-primary w-full justify-center text-sm py-2.5"
          >
            <Download size={15} /> Compress & Download Current
          </button>

          {/* Batch ZIP Export */}
          {images.length > 1 && (
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <FileArchive size={15} className="text-violet-600 shrink-0" />
                <span className="text-xs font-bold text-violet-900">Batch Archive ({images.length} files)</span>
              </div>
              <div>
                <input
                  type="text"
                  value={zipFileName}
                  onChange={(e) => {
                    setZipFileName(e.target.value);
                    if (!zipNameTouched) setZipNameTouched(true);
                  }}
                  placeholder="e.g. compressed-batch"
                  className={`field w-full text-xs ${
                    zipNameTouched && !zipFileName.trim() ? 'border-red-400' : ''
                  }`}
                />
              </div>

              {zipNameTouched && !zipFileName.trim() && (
                <p className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                  <AlertCircle size={12} /> Please name your ZIP archive.
                </p>
              )}

              <button
                type="button"
                onClick={downloadBatchZip}
                disabled={busy || !zipFileName.trim()}
                className="btn-secondary w-full justify-center text-xs py-2 bg-white"
              >
                {busy ? <LoaderCircle size={14} className="animate-spin text-violet-600" /> : <FileArchive size={14} />}
                {busy ? 'Zipping Files…' : 'Download All as ZIP Archive'}
              </button>
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}