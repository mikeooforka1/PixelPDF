import React, { useMemo, useState, useEffect } from 'react';
import { Download, FileText, RotateCcw, Files, AlertCircle, CheckCircle2 } from 'lucide-react';
import { jsPDF } from 'jspdf';

// ISO A4 standard dimensions in Points (pt)
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

const STORAGE_KEY_TEXT = 'pixelpdf_draft_text';
const STORAGE_KEY_FILENAME = 'pixelpdf_draft_filename';

const defaults = {
  text: '',
  color: '#111827',
  fontSize: 16,
  padding: 24,
};

export default function TextToPdf() {
  // Initialize state directly from localStorage if a previous draft exists
  const [settings, setSettings] = useState(() => {
    try {
      const savedText = localStorage.getItem(STORAGE_KEY_TEXT);
      return {
        ...defaults,
        text: savedText !== null ? savedText : defaults.text,
      };
    } catch {
      return defaults;
    }
  });

  const [fileName, setFileName] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_FILENAME) || '';
    } catch {
      return '';
    }
  });

  const [fileNameTouched, setFileNameTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState(Boolean(settings.text));

  // Instantly persist text content to localStorage on every change
  const handleTextChange = (e) => {
    const val = e.target.value;
    setSettings((s) => ({ ...s, text: val }));
    try {
      localStorage.setItem(STORAGE_KEY_TEXT, val);
      setLastSaved(true);
    } catch (err) {
      console.warn('LocalStorage save failed:', err);
    }
  };

  // Instantly persist custom filename to localStorage on every change
  const handleFileNameChange = (e) => {
    const val = e.target.value;
    setFileName(val);
    if (!fileNameTouched) setFileNameTouched(true);
    try {
      localStorage.setItem(STORAGE_KEY_FILENAME, val);
    } catch (err) {
      console.warn('LocalStorage save failed:', err);
    }
  };

  // Explicitly clear draft only when user confirms reset
  const reset = () => {
    setSettings(defaults);
    setFileName('');
    setFileNameTouched(false);
    setLastSaved(false);
    try {
      localStorage.removeItem(STORAGE_KEY_TEXT);
      localStorage.removeItem(STORAGE_KEY_FILENAME);
    } catch (err) {
      console.warn('LocalStorage remove failed:', err);
    }
  };

  // Calculate lines, pagination, and page break positions based on standard A4 points
  const paginationData = useMemo(() => {
    const text = settings.text;
    const margin = Number(settings.padding);
    const fontSize = Number(settings.fontSize);
    const lineHeight = fontSize * 1.45;
    const availableWidth = Math.max(40, A4_WIDTH - margin * 2);
    const availableHeight = Math.max(50, A4_HEIGHT - margin * 2);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;

    const rawParagraphs = text.replace(/\r\n/g, '\n').split('\n');
    const splitLines = [];

    rawParagraphs.forEach((paragraph) => {
      if (!paragraph) {
        splitLines.push('');
        return;
      }

      const words = paragraph.split(' ');
      let currentLine = '';

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = ctx.measureText(testLine).width;

        if (testWidth > availableWidth && currentLine) {
          splitLines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        splitLines.push(currentLine);
      }
    });

    const linesPerPage = Math.max(1, Math.floor(availableHeight / lineHeight));
    const pages = [];
    let currentBucket = [];

    splitLines.forEach((line) => {
      if (currentBucket.length >= linesPerPage) {
        pages.push(currentBucket);
        currentBucket = [line];
      } else {
        currentBucket.push(line);
      }
    });

    if (currentBucket.length > 0 || pages.length === 0) {
      pages.push(currentBucket);
    }

    return {
      pages,
      totalLines: splitLines.length,
      linesPerPage,
      totalPages: Math.max(1, pages.length),
    };
  }, [settings.text, settings.padding, settings.fontSize]);

  const hasNamedFile = fileName.trim().length > 0;

  const download = () => {
    if (!settings.text.trim()) return;
    if (!hasNamedFile) {
      setFileNameTouched(true);
      return;
    }

    setBusy(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const margin = Number(settings.padding);
      const fontSize = Number(settings.fontSize);
      const lineHeight = fontSize * 1.45;

      const rgbColor = settings.color.match(/[0-9a-f]{2}/gi)?.map((v) => parseInt(v, 16)) || [0, 0, 0];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(rgbColor[0], rgbColor[1], rgbColor[2]);

      paginationData.pages.forEach((pageLines, pageIdx) => {
        if (pageIdx > 0) doc.addPage();
        let y = margin + fontSize;

        pageLines.forEach((line) => {
          doc.text(line, margin, y);
          y += lineHeight;
        });
      });

      const cleanName = fileName.trim().replace(/\.pdf$/i, '');
      doc.save(`${cleanName}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[1.25fr_.75fr] items-start w-full">
      <div className="panel overflow-hidden border border-slate-200/80 shadow-xs">
        <div className="border-b border-slate-100 p-4 sm:p-5 bg-slate-50/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-violet-100 p-2 text-violet-700 shrink-0">
                <FileText size={20} />
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Text to PDF</h2>
                <p className="text-xs sm:text-sm text-slate-500">Universal formatting identical on Desktop, Mobile & MS Word.</p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {lastSaved && settings.text && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <CheckCircle2 size={12} /> Auto-saved
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 border border-violet-200/80 px-2.5 py-1 text-xs font-semibold text-violet-700">
                <Files size={13} /> {paginationData.totalPages} {paginationData.totalPages === 1 ? 'Page' : 'Pages'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="relative">
            <textarea
              value={settings.text}
              onChange={handleTextChange}
              className="field min-h-[340px] sm:min-h-[420px] w-full resize-y font-mono text-sm leading-6"
              aria-label="PDF text content"
              placeholder="Write or paste your content here…"
            />
          </div>

          {/* Universal Page Overflow Indicator */}
          {paginationData.totalPages > 1 && (
            <div className="mt-3.5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-amber-200"></div>
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                  Document Exceeds 1 Page ({paginationData.totalPages} Pages total)
                </span>
                <div className="h-px flex-1 bg-amber-200"></div>
              </div>
              <p className="text-center text-xs text-slate-500">
                Page boundaries are aligned to standard A4 printing. Your output layout will remain consistent across Adobe Acrobat and MS Word.
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{settings.text.length.toLocaleString()} characters</span>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-red-600 transition"
              title="Clear current text and file name from browser storage"
            >
              <RotateCcw size={12} /> Clear Draft
            </button>
          </div>
        </div>
      </div>

      <aside className="panel p-4 sm:p-5 border border-slate-200/80 shadow-xs">
        <h3 className="text-base font-bold text-slate-900">Name Your PDF</h3>
        <p className="mt-1 text-xs text-slate-500">Please choose a name for your file before downloading.</p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Enter File Name *</span>
            <div className="relative flex items-center">
              <input
                type="text"
                value={fileName}
                onChange={handleFileNameChange}
                placeholder="e.g. my-document"
                className={`field w-full pr-12 text-sm ${
                  fileNameTouched && !hasNamedFile ? 'border-red-400 focus:border-red-500' : ''
                }`}
              />
              <span className="pointer-events-none absolute right-3 text-xs font-semibold text-slate-400">.pdf</span>
            </div>
          </label>

          {fileNameTouched && !hasNamedFile && (
            <p className="flex items-center gap-1.5 text-xs text-red-600 font-medium">
              <AlertCircle size={14} className="shrink-0" /> Please type a name for your document before downloading.
            </p>
          )}

          <button
            type="button"
            onClick={download}
            disabled={!settings.text.trim() || !hasNamedFile || busy}
            className="btn-primary w-full justify-center py-2.5 text-sm"
          >
            <Download size={15} />
            {busy
              ? 'Creating PDF…'
              : !hasNamedFile
              ? 'Enter File Name to Download'
              : `Download ${paginationData.totalPages > 1 ? `(${paginationData.totalPages} Pages)` : 'PDF'}`}
          </button>
        </div>
      </aside>
    </section>
  );
}