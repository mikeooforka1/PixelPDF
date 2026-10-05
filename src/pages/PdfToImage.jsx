import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud,
  Download,
  FileArchive,
  Image as ImageIcon,
  AlertCircle,
  LoaderCircle,
  FileUp,
  Eye,
  X,
  Scan
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import JSZip from 'jszip';

// Exact matching v3.11.174 worker URL with legacy fallback
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

export default function PdfToImage() {
  const [file, setFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pages, setPages] = useState([]);
  const [embeddedImages, setEmbeddedImages] = useState([]);
  const [viewMode, setViewMode] = useState('pages'); // 'pages' | 'extractedImages'

  const [format, setFormat] = useState('png'); // 'png' | 'jpeg' | 'webp'
  const [quality, setQuality] = useState(92);
  const [scale, setScale] = useState(1.5);

  const [zipFileName, setZipFileName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanningImages, setScanningImages] = useState(false);
  const [downloadingBatch, setDownloadingBatch] = useState(false);

  // Full-size Preview Modal
  const [previewModalItem, setPreviewModalItem] = useState(null);

  const inputRef = useRef(null);

  // Render pages to HTML5 canvases
  const renderAllPages = useCallback(async (pdf, targetScale) => {
    setLoading(true);
    try {
      const numPages = pdf.numPages;
      const renderedList = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: targetScale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');

        // Draw solid white background so transparent pages don't invert in JPG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport }).promise;

        renderedList.push({
          pageNumber: i,
          width: canvas.width,
          height: canvas.height,
          canvas,
        });
      }

      setPages(renderedList);
    } catch (err) {
      console.error('Page rendering failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Safe scan for embedded image objects without crashing on undefined operators
  const scanForEmbeddedImages = useCallback(async (pdf) => {
    setScanningImages(true);
    const foundImages = [];

    try {
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const ops = await page.getOperatorList();
        const paintImgCode = pdfjsLib.OPS?.paintImageXObject ?? 85;

        for (let i = 0; i < ops.fnArray.length; i++) {
          if (ops.fnArray[i] === paintImgCode) {
            const imgName = ops.argsArray[i]?.[0];
            if (!imgName) continue;

            try {
              const imgObj = await new Promise((resolve) => {
                if (!page.objs || typeof page.objs.get !== 'function') {
                  resolve(null);
                  return;
                }
                page.objs.get(imgName, (obj) => resolve(obj));
              });

              if (imgObj && (imgObj.data || imgObj.bitmap)) {
                const canvas = document.createElement('canvas');
                canvas.width = imgObj.width;
                canvas.height = imgObj.height;
                const ctx = canvas.getContext('2d');

                if (imgObj.bitmap) {
                  ctx.drawImage(imgObj.bitmap, 0, 0);
                } else if (imgObj.data) {
                  const imgData = ctx.createImageData(imgObj.width, imgObj.height);
                  if (imgObj.data.length === imgObj.width * imgObj.height * 4) {
                    imgData.data.set(imgObj.data);
                  } else if (imgObj.data.length === imgObj.width * imgObj.height * 3) {
                    let j = 0;
                    for (let k = 0; k < imgObj.data.length; k += 3) {
                      imgData.data[j] = imgObj.data[k];
                      imgData.data[j + 1] = imgObj.data[k + 1];
                      imgData.data[j + 2] = imgObj.data[k + 2];
                      imgData.data[j + 3] = 255;
                      j += 4;
                    }
                  }
                  ctx.putImageData(imgData, 0, 0);
                }

                foundImages.push({
                  id: `${pageNum}-${imgName}-${foundImages.length}`,
                  pageNumber: pageNum,
                  name: `Image ${foundImages.length + 1} (Page ${pageNum})`,
                  width: canvas.width,
                  height: canvas.height,
                  canvas,
                });
              }
            } catch (innerErr) {
              console.warn('Skipped complex image stream:', innerErr);
            }
          }
        }
      }
      setEmbeddedImages(foundImages);
    } catch (err) {
      console.warn('Embedded scan encountered notice:', err);
    } finally {
      setScanningImages(false);
    }
  }, []);

  // Upload handler with isolated Uint8Array buffer
  const handlePdfUpload = async (uploadedFile) => {
    if (!uploadedFile || uploadedFile.type !== 'application/pdf') return;
    setFile(uploadedFile);
    setZipFileName(`${uploadedFile.name.replace(/\.pdf$/i, '')}-converted`);
    setPages([]);
    setEmbeddedImages([]);
    setViewMode('pages');
    setLoading(true);

    try {
      const bytes = await uploadedFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(bytes),
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
      });

      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);

      await renderAllPages(pdf, scale);
      scanForEmbeddedImages(pdf);
    } catch (err) {
      console.error('Failed to load PDF document:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleScaleChange = async (newScale) => {
    setScale(newScale);
    if (pdfDoc) {
      await renderAllPages(pdfDoc, newScale);
    }
  };

  const getCanvasDataUrl = (canvas) => {
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    return canvas.toDataURL(mime, quality / 100);
  };

  const downloadSingleItem = (item, isPage = true) => {
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : format;
    const base = file ? file.name.replace(/\.pdf$/i, '') : 'pixelpdf';
    const filename = isPage
      ? `${base}-page-${item.pageNumber}.${ext}`
      : `${base}-extracted-${item.id}.${ext}`;

    item.canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      mime,
      quality / 100
    );
  };

  const downloadAllZip = async () => {
    const targetList = viewMode === 'pages' ? pages : embeddedImages;
    if (!targetList.length || !file) return;
    if (!zipFileName.trim()) {
      setNameTouched(true);
      return;
    }

    setDownloadingBatch(true);
    try {
      const zip = new JSZip();
      const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      const ext = format === 'jpeg' ? 'jpg' : format;
      const base = file.name.replace(/\.pdf$/i, '');

      for (let i = 0; i < targetList.length; i++) {
        const item = targetList[i];
        const filename =
          viewMode === 'pages'
            ? `${base}-page-${item.pageNumber}.${ext}`
            : `${base}-image-${i + 1}-page-${item.pageNumber}.${ext}`;

        const blob = await new Promise((resolve) =>
          item.canvas.toBlob(resolve, mime, quality / 100)
        );
        zip.file(filename, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zipFileName.trim().replace(/\.zip$/i, '')}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingBatch(false);
    }
  };

  const activeDisplayItems = viewMode === 'pages' ? pages : embeddedImages;

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_360px] items-start w-full">
      {/* Visual Canvas Gallery */}
      <div className="panel overflow-hidden border border-slate-200/80 shadow-xs flex flex-col">
        <div className="border-b border-slate-100 p-4 sm:p-5 bg-slate-50/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">PDF to Image Converter</h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Rasterize full pages or scan and extract embedded photo assets client-side.
              </p>
            </div>
            {file && (
              <button
                type="button"
                className="btn-secondary self-start sm:self-auto text-xs py-1.5 px-3"
                onClick={() => {
                  setFile(null);
                  setPdfDoc(null);
                  setPages([]);
                  setEmbeddedImages([]);
                  setPreviewModalItem(null);
                }}
              >
                <FileUp size={14} /> Change Document
              </button>
            )}
          </div>

          {/* Submode Switcher */}
          {file && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('pages')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewMode === 'pages'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>Full Pages ({pages.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('extractedImages')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewMode === 'extractedImages'
                    ? 'bg-violet-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Scan size={13} />
                <span>Detected Photos & Assets ({embeddedImages.length})</span>
                {scanningImages && <LoaderCircle size={12} className="animate-spin text-violet-400" />}
              </button>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {!file ? (
            <div
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-8 sm:p-14 text-center hover:border-violet-400 hover:bg-violet-50/40 transition"
            >
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handlePdfUpload(e.target.files?.[0])}
              />
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
                <UploadCloud className="text-violet-600" size={28} />
              </div>
              <p className="mt-4 font-bold text-slate-800">Upload a PDF to convert</p>
              <p className="mt-1 text-xs sm:text-sm text-slate-500">
                Rasterize pages or extract original embedded image files in high quality
              </p>
            </div>
          ) : loading ? (
            <div className="py-20 text-center">
              <LoaderCircle className="animate-spin text-violet-600 mx-auto" size={36} />
              <p className="mt-3 text-sm font-semibold text-slate-700">Rendering high-resolution pages…</p>
            </div>
          ) : activeDisplayItems.length === 0 ? (
            <div className="py-14 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <ImageIcon size={32} className="mx-auto text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {viewMode === 'extractedImages'
                  ? 'No standalone embedded photo streams found in this document.'
                  : 'No pages available to display.'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {viewMode === 'extractedImages' && 'Switch back to "Full Pages" to convert the page layout to images.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>
                  Showing {activeDisplayItems.length} {viewMode === 'pages' ? 'Rendered Pages' : 'Extracted Images'}
                </span>
                <span className="text-violet-700 font-medium">Click thumbnail to inspect full size</span>
              </div>

              {/* Grid of Rendered Thumbnails */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[580px] overflow-y-auto p-1">
                {activeDisplayItems.map((item, idx) => {
                  const dataUrl = getCanvasDataUrl(item.canvas);
                  return (
                    <article
                      key={item.id || item.pageNumber || idx}
                      className="group relative rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden hover:shadow-md transition flex flex-col"
                    >
                      <div
                        onClick={() => setPreviewModalItem({ ...item, dataUrl })}
                        className="relative aspect-[3/4] bg-slate-100/70 flex items-center justify-center p-2.5 cursor-pointer overflow-hidden"
                      >
                        <img
                          src={dataUrl}
                          alt={`Item ${item.pageNumber || idx + 1}`}
                          className="max-h-full max-w-full object-contain rounded shadow-2xs transition group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-slate-950/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-bold bg-slate-900/80 backdrop-blur-xs px-2.5 py-1.5 rounded-lg shadow-sm">
                            <Eye size={13} /> Zoom Preview
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 flex items-center justify-between text-xs font-semibold bg-white border-t border-slate-100 mt-auto">
                        <span className="text-slate-800 truncate max-w-[130px]">
                          {item.name || `Page ${item.pageNumber}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => downloadSingleItem(item, viewMode === 'pages')}
                          className="text-violet-600 hover:text-violet-800 p-1 rounded-md hover:bg-violet-50 transition"
                          title="Download this image"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Conversion Sidebar Controls */}
      <aside className="panel p-4 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ImageIcon size={18} className="text-violet-600" /> Export Options
        </h3>

        {/* Output Format Picker */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Convert To Format</label>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { id: 'png', label: 'PNG' },
              { id: 'jpeg', label: 'JPG' },
              { id: 'webp', label: 'WEBP' },
            ].map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setFormat(fmt.id)}
                className={`py-1.5 text-xs font-semibold rounded-lg uppercase transition ${
                  format === fmt.id ? 'bg-white text-violet-700 shadow-2xs' : 'text-slate-600'
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {format === 'png'
              ? 'Lossless clarity, ideal for text & illustrations.'
              : format === 'jpeg'
              ? 'Compressed raster photo format with minimal file size.'
              : 'Next-gen web format offering high compression efficiency.'}
          </span>
        </div>

        {/* Quality Slider */}
        {format !== 'png' && (
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>Encoding Quality</span>
              <span className="text-violet-600 font-bold">{quality}%</span>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full accent-violet-600"
            />
          </div>
        )}

        {/* Resolution Scaler */}
        {viewMode === 'pages' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Resolution Scale (DPI)</label>
            <select
              value={scale}
              onChange={(e) => handleScaleChange(Number(e.target.value))}
              className="field w-full text-xs"
              disabled={loading || !file}
            >
              <option value={1}>Standard (1.0x · 72 DPI)</option>
              <option value={1.5}>Medium Crisp (1.5x · 108 DPI)</option>
              <option value={2}>High Resolution (2.0x · 144 DPI)</option>
              <option value={3}>Ultra Sharp (3.0x · 216 DPI)</option>
            </select>
          </div>
        )}

        {/* Batch ZIP Output */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">ZIP Archive Name *</span>
            <div className="relative flex items-center">
              <input
                type="text"
                value={zipFileName}
                onChange={(e) => {
                  setZipFileName(e.target.value);
                  if (!nameTouched) setNameTouched(true);
                }}
                placeholder="e.g. converted-images"
                className={`field w-full pr-12 text-sm ${
                  nameTouched && !zipFileName.trim() ? 'border-red-400 focus:border-red-500' : ''
                }`}
              />
              <span className="pointer-events-none absolute right-3 text-xs font-semibold text-slate-400">.zip</span>
            </div>
          </label>

          {nameTouched && !zipFileName.trim() && (
            <p className="flex items-center gap-1 text-xs text-red-600 font-medium">
              <AlertCircle size={13} /> Name your archive before batch downloading.
            </p>
          )}

          <button
            type="button"
            onClick={downloadAllZip}
            disabled={!activeDisplayItems.length || !zipFileName.trim() || downloadingBatch}
            className="btn-primary w-full justify-center text-sm py-2.5"
          >
            {downloadingBatch ? (
              <LoaderCircle size={15} className="animate-spin text-white" />
            ) : (
              <FileArchive size={15} />
            )}
            {downloadingBatch
              ? 'Compressing Archive…'
              : `Download All as ZIP (${activeDisplayItems.length} Files)`}
          </button>
        </div>
      </aside>

      {/* Fullscreen Zoom Preview Modal */}
      {previewModalItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in"
        >
          <div className="relative max-h-[90vh] max-w-4xl w-full rounded-2xl bg-white p-4 sm:p-6 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                  {previewModalItem.name || `Page ${previewModalItem.pageNumber}`}
                </h4>
                <p className="text-xs text-slate-500">
                  {previewModalItem.width} × {previewModalItem.height} px · Format:{' '}
                  <span className="uppercase font-semibold text-violet-700">{format}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-slate-50 rounded-xl">
              <img
                src={previewModalItem.dataUrl}
                alt="Enlarged preview"
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-sm"
              />
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-xs text-slate-400 hidden sm:inline">
                Inspect image quality before saving.
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPreviewModalItem(null)}
                  className="btn-secondary flex-1 sm:flex-none justify-center text-xs py-2 px-3"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadSingleItem(previewModalItem, viewMode === 'pages');
                    setPreviewModalItem(null);
                  }}
                  className="btn-primary flex-1 sm:flex-none justify-center text-xs py-2 px-4"
                >
                  <Download size={14} /> Download This Image
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}