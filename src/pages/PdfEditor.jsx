import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, UploadCloud, Plus, Trash2, ZoomIn, ZoomOut, Move, Type, FilePenLine, Undo2 } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf';

// Use the locally hosted PDF.js 3.11.174 worker for offline compatibility.
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ''}/pdfjs/pdf.worker.min.js`;
const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const hexRgb = hex => { const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '111827'; return rgb(parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255); };
const defaultItem = { text: 'New text', x: 40, y: 40, size: 18, color: '#111827', opacity: 100 };

export default function PdfEditor() {
  const [file, setFile] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState('add');
  const [zoom, setZoom] = useState(100);
  const [fitWidth, setFitWidth] = useState(700);
  const [size, setSize] = useState({width: 612, height: 792});
  const [items, setItems] = useState([]);
  const [originals, setOriginals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef(null);
  const viewer = useRef(null);
  const stage = useRef(null);
  const interaction = useRef(null);
  const renderJob = useRef(null);
  const taskRef = useRef(null);
  const selectedItem = items.find(i => i.id === selected);
  const pageItems = items.filter(i => i.page === page);
  const displayScale = (fitWidth / size.width) * zoom / 100;

  useEffect(() => {
    if (!viewer.current) return;
    const update = () => setFitWidth(Math.max(260, viewer.current.clientWidth - 36));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewer.current);
    return () => observer.disconnect();
  }, [file]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      if (!doc || !canvas.current) return;
      try {
        const pdfPage = await doc.getPage(page);
        if (disposed) return;
        const base = pdfPage.getViewport({scale: 1});
        setSize({width: base.width, height: base.height});
        const factor = Math.max(0.1, fitWidth / base.width * zoom / 100);
        const viewport = pdfPage.getViewport({scale: factor});
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const element = canvas.current;
        element.width = Math.ceil(viewport.width * pixelRatio);
        element.height = Math.ceil(viewport.height * pixelRatio);
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        const context = element.getContext('2d');
        const job = pdfPage.render({canvasContext: context, viewport, transform: [pixelRatio,0,0,pixelRatio,0,0]});
        renderJob.current = job;
        await job.promise;
        if (disposed) return;
        const text = await pdfPage.getTextContent();
        const textItems = text.items.filter(t => typeof t.str === 'string' && t.str.trim()).map((t, index) => {
          const transformed = pdfjs.Util.transform(base.transform, t.transform);
          const height = Math.max(4, Math.hypot(transformed[2], transformed[3]));
          return {id:`${page}:${index}`, page, text:t.str, x:transformed[4], y:transformed[5]-height, width:Math.max(3,t.width), height, size:height};
        });
        setOriginals(textItems);
      } catch (e) { if (!disposed && e.name !== 'RenderingCancelledException') setError(e.message || 'Could not render this page.'); }
    })();
    return () => { disposed = true; renderJob.current?.cancel(); };
  }, [doc, page, fitWidth, zoom]);

  useEffect(() => () => { taskRef.current?.destroy(); }, []);

  const load = async f => {
    if (!f) return;
    setError(''); setBusy(true);
    try {
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') throw Error('Select a PDF file.');
      if (f.size > 80 * 1024 * 1024) throw Error('Choose a PDF smaller than 80 MB.');
      const data = new Uint8Array(await f.arrayBuffer());
      const task = pdfjs.getDocument({data: data.slice(), isEvalSupported: false, cMapUrl: `${process.env.PUBLIC_URL || ''}/pdf-assets/cmaps/`, cMapPacked: true});
      const opened = await task.promise;
      const old = taskRef.current;
      taskRef.current = task;
      setFile(f); setBytes(data); setDoc(opened); setPage(1); setItems([]); setSelected(null); setOriginals([]);
      old?.destroy().catch(() => {});
    } catch (e) { setError(e.message || 'Could not open this PDF.'); }
    finally { setBusy(false); }
  };

  const add = () => {
    const item = {...defaultItem, id:uid(), page, kind:'add', x:Math.min(40,size.width-50), y:Math.min(40,size.height-30)};
    setItems(v => [...v,item]); setSelected(item.id);
  };
  const replace = original => {
    const previous = items.find(i => i.kind === 'replace' && i.source === original.id);
    if (previous) { setSelected(previous.id); return; }
    const item = {id:uid(),kind:'replace',source:original.id,page,text:original.text,x:original.x,y:original.y,size:original.size,color:'#111827',opacity:100,erase:{x:original.x,y:original.y,width:original.width,height:original.height}};
    setItems(v => [...v,item]); setSelected(item.id);
  };
  const change = patch => setItems(v => v.map(i => i.id === selected ? {...i,...patch} : i));
  const remove = () => {setItems(v => v.filter(i => i.id !== selected));setSelected(null);};

  const startPointer = (event, item, action) => {
    event.stopPropagation(); event.preventDefault();
    setSelected(item.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.current = {id:item.id,action,x:event.clientX,y:event.clientY,startX:item.x,startY:item.y,startSize:item.size};
  };
  const movePointer = event => {
    const active = interaction.current;
    if (!active) return;
    const factor = Math.max(0.01, displayScale);
    const dx = (event.clientX - active.x) / factor;
    const dy = (event.clientY - active.y) / factor;
    setItems(v => v.map(i => i.id !== active.id ? i : active.action === 'resize'
      ? {...i,size:clamp(active.startSize + dx / 2 + dy / 2, 6, 160)}
      : {...i,x:clamp(active.startX + dx,0,size.width-8),y:clamp(active.startY + dy,0,size.height-8)}));
  };
  const stopPointer = () => { interaction.current = null; };

  const exportFile = async () => {
    if (!bytes) return;
    setBusy(true);setError('');
    try {
      const output = await PDFDocument.load(bytes);
      const font = await output.embedFont(StandardFonts.Helvetica);
      for (const item of items) {
        const target = output.getPage(item.page-1);
        if (!target) continue;
        const {height} = target.getSize();
        if (item.erase) {
          target.drawRectangle({x:item.erase.x-1,y:height-item.erase.y-item.erase.height-2,width:item.erase.width+3,height:item.erase.height+4,color:rgb(1,1,1)});
        }
        const cleanText = item.text.replace(/\r/g,'').replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g,'?');
        const lines = cleanText.split('\n');
        lines.forEach((line,index) => {
          if (!line) return;
          target.drawText(line,{x:item.x,y:height-item.y-item.size-index*item.size*1.2,size:item.size,font,color:hexRgb(item.color),opacity:item.opacity/100});
        });
      }
      const result = await output.save();
      const url = URL.createObjectURL(new Blob([result],{type:'application/pdf'}));
      const anchor = document.createElement('a');anchor.href=url;anchor.download=`${file.name.replace(/\.pdf$/i,'')}-edited.pdf`;anchor.click();
      setTimeout(() => URL.revokeObjectURL(url),30000);
    } catch (e) { setError(`Export failed: ${e.message}`); }
    finally {setBusy(false);}
  };
  const control = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400';
  return <section className="w-full min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">PDF Editor</h2><p className="text-sm text-slate-500">Local editing · Move and resize with mouse, touch or pen</p></div>{file&&<label className="btn-secondary cursor-pointer"><UploadCloud size={16}/>Change PDF<input className="hidden" type="file" accept=".pdf,application/pdf" onChange={e=>load(e.target.files?.[0])}/></label>}</div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {!file ? <label className="block cursor-pointer rounded-3xl border-2 border-dashed border-violet-200 bg-white p-10 text-center"><UploadCloud className="mx-auto text-violet-600" size={42}/><span className="mt-3 block font-bold">Choose a PDF to edit</span><span className="block text-sm text-slate-500">Your document stays on this device</span><input className="hidden" type="file" accept=".pdf,application/pdf" onChange={e=>load(e.target.files?.[0])}/></label> : <>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3">
        <button className={`rounded-xl px-3 py-2 text-sm font-semibold ${mode==='add'?'bg-violet-600 text-white':'bg-slate-100'}`} onClick={()=>{setMode('add');setSelected(null)}}><Plus size={16} className="inline mr-1"/>Add text</button>
        <button className={`rounded-xl px-3 py-2 text-sm font-semibold ${mode==='edit'?'bg-violet-600 text-white':'bg-slate-100'}`} onClick={()=>{setMode('edit');setSelected(null)}}><FilePenLine size={16} className="inline mr-1"/>Edit PDF text</button>
        <div className="flex items-center gap-2 ml-auto"><button aria-label="Zoom out" className="rounded-lg border p-2" onClick={()=>setZoom(z=>clamp(z-25,50,300))}><ZoomOut size={18}/></button><span className="text-sm tabular-nums">{zoom}%</span><button aria-label="Zoom in" className="rounded-lg border p-2" onClick={()=>setZoom(z=>clamp(z+25,50,300))}><ZoomIn size={18}/></button><button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>setZoom(100)}>Fit</button></div>
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 rounded-2xl border bg-slate-100 p-2 sm:p-4"><div className="mb-3 flex items-center justify-center gap-3"><button className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" disabled={page<=1} onClick={()=>{setPage(p=>p-1);setSelected(null)}}>Previous</button><span className="text-sm font-semibold">{page} / {doc?.numPages}</span><button className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" disabled={page>=doc?.numPages} onClick={()=>{setPage(p=>p+1);setSelected(null)}}>Next</button></div>
          <div ref={viewer} className="max-h-[78vh] min-h-[380px] w-full overflow-auto rounded-xl bg-slate-200 p-2"><div ref={stage} className="relative mx-auto bg-white shadow-xl" style={{width:size.width*displayScale,height:size.height*displayScale}} onPointerMove={movePointer} onPointerUp={stopPointer} onPointerCancel={stopPointer}>
            <canvas ref={canvas} className="block" />
            {mode==='edit'&&originals.map(o=><button key={o.id} title={`Edit: ${o.text}`} onClick={()=>replace(o)} className="absolute border border-transparent bg-violet-300/10 hover:border-violet-500 focus:border-violet-500" style={{left:o.x*displayScale,top:o.y*displayScale,width:Math.max(8,o.width*displayScale),height:Math.max(8,o.height*displayScale)}} aria-label={`Edit text ${o.text.slice(0,60)}`}/>)}
            {pageItems.map(i=><div key={i.id} className={`absolute cursor-move whitespace-pre select-none ${selected===i.id?'outline outline-2 outline-violet-500':'hover:outline hover:outline-1 hover:outline-violet-300'}`} style={{left:i.x*displayScale,top:i.y*displayScale,fontSize:i.size*displayScale,lineHeight:1.2,color:i.color,opacity:i.opacity/100,touchAction:'none',maxWidth:`${(size.width-i.x)*displayScale}px`}} onPointerDown={e=>startPointer(e,i,'move')}>
              {i.kind==='replace'&&<span className="absolute inset-0 -z-10 bg-white"/>}{i.text||'Text'}
              {selected===i.id&&<span role="button" aria-label="Resize text" title="Drag to resize" onPointerDown={e=>startPointer(e,i,'resize')} className="absolute -bottom-3 -right-3 flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-white shadow" style={{touchAction:'none'}}><Move size={13}/></span>}
            </div>)}
          </div></div>
          <p className="mt-2 text-center text-xs text-slate-500">Scroll to inspect the full page. Zoom up to 300%. Text edits are approximations, not changes to embedded font streams.</p>
        </div>
        <aside className="min-w-0 rounded-2xl border bg-white p-4 sm:p-5"><h3 className="font-bold">{mode==='add'?'Add text overlay':'Replace visible PDF text'}</h3><p className="mt-1 text-xs text-slate-500">{mode==='add'?'Add a new text box, then drag and resize it.':'Select detected text on the page. Replacement covers its original area with white and draws new text; complex backgrounds may not match.'}</p>
          {mode==='add'&&<button className="btn-primary mt-4 w-full" onClick={add}><Plus size={16}/>Add text box</button>}
          {selectedItem?<div className="mt-5 space-y-3"><label className="block text-sm font-semibold">Text<textarea className={`${control} mt-1`} rows={3} value={selectedItem.text} onChange={e=>change({text:e.target.value})}/></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">X (PDF units)<input type="number" className={`${control} mt-1`} value={Math.round(selectedItem.x)} onChange={e=>change({x:clamp(Number(e.target.value),0,size.width)})}/></label><label className="text-xs font-semibold">Y (PDF units)<input type="number" className={`${control} mt-1`} value={Math.round(selectedItem.y)} onChange={e=>change({y:clamp(Number(e.target.value),0,size.height)})}/></label></div><label className="block text-sm font-semibold">Text size: {Math.round(selectedItem.size)}<input type="range" min="6" max="160" className="mt-2 w-full" value={selectedItem.size} onChange={e=>change({size:Number(e.target.value)})}/></label><label className="flex items-center gap-3 text-sm font-semibold">Color<input type="color" value={selectedItem.color} onChange={e=>change({color:e.target.value})}/></label><label className="block text-sm font-semibold">Opacity: {selectedItem.opacity}%<input className="mt-2 w-full" type="range" min="10" max="100" value={selectedItem.opacity} onChange={e=>change({opacity:Number(e.target.value)})}/></label><button className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-red-700" onClick={remove}><Trash2 size={16}/>Remove selection</button></div>:<p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{mode==='add'?'Add a box to start editing.':'Tap highlighted text to replace it. Image-only scans require OCR first.'}</p>}
          <div className="mt-5 border-t pt-4"><p className="text-xs text-slate-500">{items.length} change(s) across {doc?.numPages} page(s)</p><button className="btn-primary mt-3 w-full" disabled={busy} onClick={exportFile}><Download size={16}/>{busy?'Processing…':'Download edited PDF'}</button><button className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border p-2 text-sm" disabled={!items.length} onClick={()=>{setItems([]);setSelected(null)}}><Undo2 size={15}/>Clear all changes</button></div>
        </aside>
      </div>
    </>}
  </section>;
}
