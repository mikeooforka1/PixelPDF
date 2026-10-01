import React, { useCallback, useRef, useState } from 'react';
import { Download, ImagePlus, Trash2, UploadCloud, FileEdit } from 'lucide-react';
import { jsPDF } from 'jspdf';

const accepted = ['image/png', 'image/jpeg'];
const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function ImageToPdf() {
  const [images, setImages] = useState([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('pixelpdf-images');
  const inputRef = useRef(null);

  const addFiles = useCallback((files) => {
    const incoming = Array.from(files).filter((f) => accepted.includes(f.type));
    if (!incoming.length) return;
    Promise.all(
      incoming.map(async (file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        name: file.name,
        size: file.size,
        data: await readAsDataURL(file),
      }))
    ).then((items) => setImages((v) => [...v, ...items]));
  }, []);

  const remove = (id) => setImages((v) => v.filter((x) => x.id !== id));

  const convert = async () => {
    if (!images.length) return;
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();

      for (let i = 0; i < images.length; i++) {
        if (i) doc.addPage();
        const item = images[i];
        const props = doc.getImageProperties(item.data);
        const scale = Math.min((W - 48) / props.width, (H - 48) / props.height);
        const w = props.width * scale;
        const h = props.height * scale;
        doc.addImage(item.data, props.fileType || 'JPEG', (W - w) / 2, (H - h) / 2, w, h, undefined, 'FAST');
      }

      const cleanName = fileName.trim().replace(/\.pdf$/i, '') || 'pixelpdf-images';
      doc.save(`${cleanName}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-4 sm:p-6 transition-all duration-200">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Image to PDF</h2>
          <p className="text-sm text-slate-500">Combine PNG, JPG, or JPEG images into a clean PDF document.</p>
        </div>
        <span className="self-start sm:self-auto rounded-full bg-violet-50 border border-violet-200 px-3 py-1 text-xs font-semibold text-violet-700">
          {images.length} {images.length === 1 ? 'image' : 'images'}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-6 cursor-pointer rounded-2xl border-2 border-dashed p-6 sm:p-10 text-center transition ${
          drag
            ? 'border-violet-500 bg-violet-50'
            : 'border-slate-200 bg-slate-50 hover:border-violet-400 hover:bg-violet-50/40'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5">
          <UploadCloud className="text-violet-600" size={28} />
        </div>
        <p className="mt-3 text-base font-semibold text-slate-800">Tap to browse or drop images here</p>
        <p className="mt-1 text-xs sm:text-sm text-slate-500">Supports PNG, JPG, and JPEG</p>
      </div>

      {images.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {images.map((img, index) => (
            <article
              key={img.id}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition hover:shadow-md"
            >
              <div className="relative aspect-[4/3] bg-slate-100">
                <img src={img.data} alt={img.name} className="h-full w-full object-contain p-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(img.id);
                  }}
                  aria-label={`Remove ${img.name}`}
                  className="absolute right-1.5 top-1.5 rounded-lg bg-white/90 p-1.5 text-slate-500 shadow-sm backdrop-blur-xs transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  #{index + 1}
                </span>
              </div>
              <div className="truncate px-2.5 py-2 text-xs font-medium text-slate-700" title={img.name}>
                {img.name}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4 border-t border-slate-100 pt-6">
        <div className="flex flex-col gap-1 sm:max-w-xs">
          <label htmlFor="image-pdf-filename" className="text-xs font-semibold text-slate-600">
            Export File Name
          </label>
          <div className="relative flex items-center">
            <input
              id="image-pdf-filename"
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="pixelpdf-images"
              className="field w-full pr-12 text-sm"
            />
            <span className="pointer-events-none absolute right-3 text-xs font-medium text-slate-400">.pdf</span>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
          <button
            type="button"
            className="btn-secondary w-full sm:w-auto justify-center"
            onClick={() => setImages([])}
            disabled={!images.length}
          >
            <Trash2 size={16} /> Clear all
          </button>
          <button
            type="button"
            className="btn-primary w-full sm:w-auto justify-center"
            onClick={convert}
            disabled={!images.length || busy}
          >
            <Download size={16} />
            {busy ? 'Creating PDF…' : 'Convert Images to PDF'}
          </button>
        </div>
      </div>
    </section>
  );
}