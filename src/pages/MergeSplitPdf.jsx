import React, { useState, useRef, useEffect } from 'react';
import {
  Layers,
  Scissors,
  UploadCloud,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  AlertCircle,
  FileCheck2,
  FileText,
  CheckSquare,
  Square
} from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export default function MergeSplitPdf() {
  const [activeSubMode, setActiveSubMode] = useState('merge'); // 'merge' | 'split'

  // --- MERGE STATE ---
  const [mergeFiles, setMergeFiles] = useState([]);
  const [mergeFileName, setMergeFileName] = useState('');
  const [mergeNameTouched, setMergeNameTouched] = useState(false);
  const [mergeBusy, setMergeBusy] = useState(false);
  const mergeInputRef = useRef(null);

  // --- SPLIT STATE ---
  const [splitFile, setSplitFile] = useState(null);
  const [splitPdfDoc, setSplitPdfDoc] = useState(null);
  const [splitTotalPages, setSplitTotalPages] = useState(0);
  const [selectedPages, setSelectedPages] = useState([]); // 1-based page numbers
  const [rangeInput, setRangeInput] = useState('');
  const [splitFileName, setSplitFileName] = useState('');
  const [splitNameTouched, setSplitNameTouched] = useState(false);
  const [splitBusy, setSplitBusy] = useState(false);
  const [pageThumbnails, setPageThumbnails] = useState([]);
  const splitInputRef = useRef(null);

  // -------------------------------------------------------------
  // MERGE HANDLERS
  // -------------------------------------------------------------
  const handleMergeFilesUpload = async (fileList) => {
    const validPdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf');
    if (!validPdfs.length) return;

    const newItems = await Promise.all(
      validPdfs.map(async (file) => {
        const bytes = await file.arrayBuffer();
        try {
          const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
          return {
            id: `${file.name}-${file.lastModified}-${Math.random()}`,
            file,
            name: file.name,
            bytes,
            pageCount: doc.getPageCount(),
          };
        } catch {
          return null;
        }
      })
    );

    setMergeFiles((prev) => [...prev, ...newItems.filter(Boolean)]);
  };

  const moveMergeFile = (index, direction) => {
    setMergeFiles((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, item);
      return copy;
    });
  };

  const removeMergeFile = (id) => {
    setMergeFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleMergeDownload = async () => {
    if (!mergeFiles.length) return;
    if (!mergeFileName.trim()) {
      setMergeNameTouched(true);
      return;
    }

    setMergeBusy(true);
    try {
      const mergedPdf = await PDFDocument.create();
      for (const item of mergeFiles) {
        const loadedPdf = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(loadedPdf, loadedPdf.getPageIndices());
        copiedPages.forEach((p) => mergedPdf.addPage(p));
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const clean = mergeFileName.trim().replace(/\.pdf$/i, '');
      a.download = `${clean}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setMergeBusy(false);
    }
  };

  // -------------------------------------------------------------
  // SPLIT / EXTRACT HANDLERS
  // -------------------------------------------------------------
  const handleSplitFileUpload = async (file) => {
    if (!file || file.type !== 'application/pdf') return;
    setSplitFile(file);
    setSplitFileName(`${file.name.replace(/\.pdf$/i, '')}-extracted`);
    setSelectedPages([]);
    setRangeInput('');
    setPageThumbnails([]);

    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    setSplitPdfDoc(pdfDoc);
    const count = pdfDoc.getPageCount();
    setSplitTotalPages(count);

    // Render quick lightweight preview thumbnails using pdf.js
    const pdfJsDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const thumbs = [];
    for (let i = 1; i <= Math.min(count, 30); i++) {
      const page = await pdfJsDoc.getPage(i);
      const viewport = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      thumbs.push({ pageNum: i, dataUrl: canvas.toDataURL() });
    }
    setPageThumbnails(thumbs);
  };

  const togglePageSelection = (pageNum) => {
    setSelectedPages((prev) =>
      prev.includes(pageNum) ? prev.filter((p) => p !== pageNum) : [...prev, pageNum].sort((a, b) => a - b)
    );
  };

  const selectAllPages = () => {
    if (selectedPages.length === splitTotalPages) {
      setSelectedPages([]);
    } else {
      setSelectedPages(Array.from({ length: splitTotalPages }, (_, i) => i + 1));
    }
  };

  const applyRangeInput = () => {
    if (!rangeInput.trim() || !splitTotalPages) return;
    const pages = new Set();
    const parts = rangeInput.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map((n) => parseInt(n.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.max(1, Math.min(start, end));
          const max = Math.min(splitTotalPages, Math.max(start, end));
          for (let p = min; p <= max; p++) pages.add(p);
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (!isNaN(p) && p >= 1 && p <= splitTotalPages) pages.add(p);
      }
    }
    setSelectedPages(Array.from(pages).sort((a, b) => a - b));
  };

  const handleSplitDownload = async () => {
    if (!splitPdfDoc || !selectedPages.length) return;
    if (!splitFileName.trim()) {
      setSplitNameTouched(true);
      return;
    }

    setSplitBusy(true);
    try {
      const newDoc = await PDFDocument.create();
      const pageIndices = selectedPages.map((p) => p - 1);
      const copied = await newDoc.copyPages(splitPdfDoc, pageIndices);
      copied.forEach((p) => newDoc.addPage(p));

      const outBytes = await newDoc.save();
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const clean = splitFileName.trim().replace(/\.pdf$/i, '');
      a.download = `${clean}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setSplitBusy(false);
    }
  };

  return (
    <section className="panel p-4 sm:p-6 transition-all duration-200">
      {/* Sub-Tabs: Merge vs Split */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Merge & Split PDFs</h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Combine multiple PDF files into one, or extract individual pages and custom page ranges.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSubMode('merge')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition ${
              activeSubMode === 'merge' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers size={14} /> Merge PDFs
          </button>
          <button
            type="button"
            onClick={() => setActiveSubMode('split')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition ${
              activeSubMode === 'split' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scissors size={14} /> Split / Extract
          </button>
        </div>
      </div>

      {/* ======================= MERGE VIEW ======================= */}
      {activeSubMode === 'merge' && (
        <div className="mt-5 space-y-6">
          <div
            onClick={() => mergeInputRef.current?.click()}
            className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 sm:p-10 text-center hover:border-violet-400 hover:bg-violet-50/40 transition"
          >
            <input
              ref={mergeInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handleMergeFilesUpload(e.target.files)}
            />
            <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
              <UploadCloud className="text-violet-600" size={26} />
            </div>
            <p className="mt-3 text-sm sm:text-base font-semibold text-slate-800">
              Upload multiple PDF files to combine
            </p>
            <p className="mt-1 text-xs text-slate-500">Tap to browse or drop PDF documents here</p>
          </div>

          {mergeFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
                <span>{mergeFiles.length} files queued (drag or use arrows to order)</span>
                <button
                  type="button"
                  onClick={() => setMergeFiles([])}
                  className="text-red-500 hover:text-red-700 transition"
                >
                  Clear all
                </button>
              </div>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-white">
                {mergeFiles.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 p-3 text-xs sm:text-sm hover:bg-slate-50/60 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 font-bold text-slate-600 text-xs shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{item.name}</p>
                        <p className="text-[11px] text-slate-400">{item.pageCount} pages</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveMergeFile(idx, -1)}
                        disabled={idx === 0}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        title="Move Up"
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveMergeFile(idx, 1)}
                        disabled={idx === mergeFiles.length - 1}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        title="Move Down"
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMergeFile(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Merge File Name & Action */}
          <div className="flex flex-col gap-4 border-t border-slate-100 pt-5">
            <div className="flex flex-col gap-1 w-full sm:max-w-md">
              <label className="text-xs font-semibold text-slate-700">Output PDF File Name *</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={mergeFileName}
                  onChange={(e) => {
                    setMergeFileName(e.target.value);
                    if (!mergeNameTouched) setMergeNameTouched(true);
                  }}
                  placeholder="e.g. combined-documents"
                  className={`field w-full pr-12 text-sm ${
                    mergeNameTouched && !mergeFileName.trim() ? 'border-red-400 focus:border-red-500' : ''
                  }`}
                />
                <span className="pointer-events-none absolute right-3 text-xs font-semibold text-slate-400">.pdf</span>
              </div>
              {mergeNameTouched && !mergeFileName.trim() && (
                <p className="flex items-center gap-1 text-xs text-red-600 font-medium mt-1">
                  <AlertCircle size={13} /> Please provide a file name before merging.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleMergeDownload}
              disabled={mergeFiles.length < 2 || !mergeFileName.trim() || mergeBusy}
              className="btn-primary w-full sm:w-auto justify-center text-sm py-2.5 self-start"
            >
              <Download size={15} />
              {mergeBusy
                ? 'Merging Documents…'
                : !mergeFileName.trim()
                ? 'Name Your File to Merge'
                : `Merge ${mergeFiles.length} PDFs into One`}
            </button>
          </div>
        </div>
      )}

      {/* ======================= SPLIT VIEW ======================= */}
      {activeSubMode === 'split' && (
        <div className="mt-5 space-y-6">
          {!splitFile ? (
            <div
              onClick={() => splitInputRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 sm:p-10 text-center hover:border-violet-400 hover:bg-violet-50/40 transition"
            >
              <input
                ref={splitInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleSplitFileUpload(e.target.files?.[0])}
              />
              <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
                <Scissors className="text-violet-600" size={26} />
              </div>
              <p className="mt-3 text-sm sm:text-base font-semibold text-slate-800">
                Upload a PDF file to extract pages
              </p>
              <p className="mt-1 text-xs text-slate-500">Pick individual pages or type page ranges</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-violet-50/60 border border-violet-200/80 rounded-xl">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{splitFile.name}</p>
                  <p className="text-xs text-slate-500">{splitTotalPages} total pages</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSplitFile(null);
                    setSplitPdfDoc(null);
                    setSelectedPages([]);
                  }}
                  className="btn-secondary text-xs py-1.5 px-2.5 self-start sm:self-auto"
                >
                  Change Document
                </button>
              </div>

              {/* Selection Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllPages}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
                  >
                    {selectedPages.length === splitTotalPages ? (
                      <CheckSquare size={15} className="text-violet-600" />
                    ) : (
                      <Square size={15} className="text-slate-400" />
                    )}
                    {selectedPages.length === splitTotalPages ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-xs text-slate-400">|</span>
                  <span className="text-xs font-medium text-slate-600">
                    {selectedPages.length} selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder="Range e.g. 1-3, 5"
                    className="field py-1 px-2.5 text-xs w-32 sm:w-36"
                  />
                  <button
                    type="button"
                    onClick={applyRangeInput}
                    className="btn-secondary py-1 px-2.5 text-xs shrink-0"
                  >
                    Apply Range
                  </button>
                </div>
              </div>

              {/* Page Thumbnails Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 max-h-96 overflow-y-auto p-1">
                {pageThumbnails.map((thumb) => {
                  const isSelected = selectedPages.includes(thumb.pageNum);
                  return (
                    <div
                      key={thumb.pageNum}
                      onClick={() => togglePageSelection(thumb.pageNum)}
                      className={`relative cursor-pointer rounded-xl border-2 p-1.5 transition text-center bg-white shadow-2xs ${
                        isSelected
                          ? 'border-violet-600 ring-2 ring-violet-200'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <img
                        src={thumb.dataUrl}
                        alt={`Page ${thumb.pageNum}`}
                        className="mx-auto rounded object-contain max-h-32 w-auto"
                      />
                      <div className="mt-1 text-[11px] font-bold text-slate-700">
                        Page {thumb.pageNum}
                      </div>
                      <div
                        className={`absolute top-2 right-2 rounded-md p-0.5 text-white ${
                          isSelected ? 'bg-violet-600' : 'bg-slate-300'
                        }`}
                      >
                        <FileCheck2 size={12} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Split File Name & Action */}
              <div className="flex flex-col gap-4 border-t border-slate-100 pt-5">
                <div className="flex flex-col gap-1 w-full sm:max-w-md">
                  <label className="text-xs font-semibold text-slate-700">Output PDF File Name *</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={splitFileName}
                      onChange={(e) => {
                        setSplitFileName(e.target.value);
                        if (!splitNameTouched) setSplitNameTouched(true);
                      }}
                      placeholder="e.g. extracted-pages"
                      className={`field w-full pr-12 text-sm ${
                        splitNameTouched && !splitFileName.trim() ? 'border-red-400 focus:border-red-500' : ''
                      }`}
                    />
                    <span className="pointer-events-none absolute right-3 text-xs font-semibold text-slate-400">
                      .pdf
                    </span>
                  </div>
                  {splitNameTouched && !splitFileName.trim() && (
                    <p className="flex items-center gap-1 text-xs text-red-600 font-medium mt-1">
                      <AlertCircle size={13} /> Please provide a file name before extracting.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSplitDownload}
                  disabled={!selectedPages.length || !splitFileName.trim() || splitBusy}
                  className="btn-primary w-full sm:w-auto justify-center text-sm py-2.5 self-start"
                >
                  <Download size={15} />
                  {splitBusy
                    ? 'Extracting Pages…'
                    : !splitFileName.trim()
                    ? 'Name Your File to Download'
                    : `Download Extracted (${selectedPages.length} Pages)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}