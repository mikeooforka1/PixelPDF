import React,{useEffect,useRef,useState} from 'react';
import {ArrowUp,ArrowDown,RotateCw,Trash2,FileCheck2} from 'lucide-react';
import {checkFile,splitPdf,compressPdf,pdfToPptx,wordToPdf,excelToPdf,powerpointToPdf,organizePdf,pdfPreviews,downloadBlob} from '../utils/conversions';
const tools={
  split:{title:'Split PDF',extension:'pdf',description:'Keep selected pages in a new PDF, or download every page as a separate PDF inside a ZIP.'},
  compresspdf:{title:'Compress PDF',extension:'pdf',description:'Reduce a PDF’s file size. Choose whether to preserve its text or make smaller image-based pages.'},
  wordtopdf:{title:'Word to PDF',extension:'docx',description:'Turn a modern Word document into a PDF you can share and print.',note:'Browser conversion supports body text, basic headings, tables and common embedded images. Fonts, headers, footers, columns and advanced layouts may differ. Review the PDF before sharing. Supports Latin-script text; use Office’s PDF export for other scripts. PDF pages are rendered as images, so their text is not searchable.'},
  exceltopdf:{title:'Excel to PDF',extension:'xlsx',description:'Put the contents of your Excel worksheets into readable PDF tables.',note:'Uses saved cell values; it does not calculate formulas. If a formula has no saved result, its formula text is shown. Wide sheets are split into column sections. Charts, images and Excel print layouts are not reproduced. Review dates and number formats. Supports Latin-script text. PDF pages are image-based.'},
  powerpointtopdf:{title:'PowerPoint to PDF',extension:'pptx',description:'Turn presentation slides into PDF pages for viewing and sharing.',note:'Supports basic slide text, solid backgrounds and common embedded images. Themes, grouped shapes, charts, animations, tables and SmartArt may differ or be omitted. Review the PDF before sharing; it is image-based and supports Latin-script text.'},
  pdftopowerpoint:{title:'PDF to PowerPoint',extension:'pdf',description:'Create a presentation with one PDF page on each slide.',note:'Each page becomes a slide image to preserve its appearance. Slide text and objects are not separately editable. PDFs with different page sizes are fitted inside the first page’s slide size.'},
  organize:{title:'Organize PDF',extension:'pdf',description:'Move pages into a new order, turn them upright, or remove pages you do not need.'}
};
const button='inline-flex min-h-[44px] items-center justify-center rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white focus-visible:ring-4 focus-visible:ring-violet-200 disabled:opacity-50';
const input='mt-2 min-h-[44px] w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-violet-200';
export default function ConversionWorkspace({kind}) {
  const tool=tools[kind], [file,setFile]=useState(null),[name,setName]=useState('document'),[range,setRange]=useState('1'),[separate,setSeparate]=useState(false),[compression,setCompression]=useState('lossless'),[pages,setPages]=useState([]),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const task=useRef(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;task.current?.abort();};},[]);
  const updateStatus=value=>{if(mounted.current&&!task.current?.signal.aborted)setStatus(value);};
  async function chooseFile(selected) {
    if(!selected||busy)return;setResult(null);setError('');setPages([]);setStatus('');setFile(null);
    try{checkFile(selected,tool.extension);setFile(selected);setName(selected.name.replace(/\.[^.]+$/,'')+'-'+(kind==='organize'?'organized':kind==='split'?'pages':kind==='compresspdf'?'compressed':'converted'));
      if(kind==='organize'){const controller=new AbortController();task.current=controller;setBusy(true);const next=await pdfPreviews(selected,controller.signal,updateStatus);if(mounted.current&&!controller.signal.aborted){setPages(next);setStatus(`${next.length} pages ready to organize`);}}
    }catch(failure){if(mounted.current){setError(failure.name==='AbortError'?'Page loading cancelled. Choose the document again.':failure.message);setFile(null);}}
    finally{if(mounted.current)setBusy(false);}
  }
  async function convert() {
    if(!file||busy)return;const controller=new AbortController();task.current=controller;setBusy(true);setError('');setResult(null);
    try{
      const args=[file,controller.signal,updateStatus];let converted;
      if(kind==='split')converted=await splitPdf(file,range,separate,controller.signal,updateStatus);
      else if(kind==='compresspdf')converted=await compressPdf(file,compression,controller.signal,updateStatus);
      else if(kind==='organize')converted=await organizePdf(file,pages,controller.signal,updateStatus);
      else converted=await ({wordtopdf:wordToPdf,exceltopdf:excelToPdf,powerpointtopdf:powerpointToPdf,pdftopowerpoint:pdfToPptx}[kind])(...args);
      if(mounted.current&&!controller.signal.aborted){setResult(converted);setStatus('Your document is ready. Download and review it.');}
    }catch(failure){if(mounted.current){setError(failure.name==='AbortError'?'Conversion cancelled. Your original file is unchanged.':/encrypted|password/i.test(failure.message)?'This document is protected. Save an unlocked copy and try again.':failure.message||'This document could not be converted.');setStatus('');}}
    finally{if(mounted.current)setBusy(false);}
  }
  function changePages(next){setPages(next);setResult(null);}
  function move(index,step){const next=[...pages];[next[index],next[index+step]]=[next[index+step],next[index]];changePages(next);}
  return <section className="mx-auto w-full min-w-0 max-w-5xl space-y-5 p-2 sm:p-6">
    <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-violet-600">On-device document tools</p><h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{tool.title}</h1><p className="mt-2 text-slate-600">{tool.description}</p></div>
    {tool.note&&<p className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">{tool.note}</p>}
    <div className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <label className="block font-semibold text-slate-800">1. Choose your .{tool.extension} document<input aria-label="Conversion document" type="file" accept={'.'+tool.extension} disabled={busy} className="mt-3 block w-full min-w-0 max-w-full text-sm" onChange={event=>{chooseFile(event.target.files[0]);event.target.value='';}}/><span className="mt-2 block text-xs font-normal text-slate-500">Up to 50 MB. Processing stays in this browser and works with prepared offline tools.</span></label>
      {file&&<p className="break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{file.name} · {(file.size/1048576).toFixed(2)} MB</p>}
      {kind==='split'&&<div className="space-y-3"><label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" checked={separate} disabled={busy} onChange={event=>{setSeparate(event.target.checked);setResult(null);}}/>Save every page separately as a ZIP</label>{!separate&&<label className="block font-semibold">Pages to keep<input aria-label="Pages to keep" className={input} value={range} disabled={busy} onChange={event=>{setRange(event.target.value);setResult(null);}} placeholder="For example: 1-3, 5"/><small className="mt-2 block font-normal text-slate-500">Use a comma between pages and a dash for a range. The output follows the original page order.</small></label>}</div>}
      {kind==='compresspdf'&&<label className="block font-semibold">Compression method<select aria-label="Compression method" className={input} value={compression} disabled={busy} onChange={event=>{setCompression(event.target.value);setResult(null);}}><option value="lossless">Keep text and quality</option><option value="balanced">Balanced · image pages</option><option value="small">Smaller file · image pages</option></select><small className="mt-2 block font-normal leading-relaxed text-slate-500">Keep text rewrites the PDF without rasterizing it and may save little space. Image modes can reduce scanned PDFs, but remove searchable text, links and interactive fields. We keep the original if conversion makes it larger.</small></label>}
      {kind==='organize'&&pages.length>0&&<div><p className="mb-3 text-sm text-slate-600">Move pages with the arrows. Rotate or remove a page; at least one page must remain. Changes apply only to the downloaded copy.</p><div className="grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">{pages.map((page,index)=><article key={page.index} className="min-w-0 overflow-hidden rounded-xl border bg-slate-50 p-3"><img src={page.preview} alt={`Original page ${page.index+1}`} className="h-36 w-full object-contain" style={{transform:`rotate(${page.rotation}deg)`}}/><p className="mt-2 text-sm font-semibold">Position {index+1} · page {page.index+1}</p><div className="mt-2 flex flex-wrap gap-1">{[[ArrowUp,'Move earlier',()=>move(index,-1),index===0],[ArrowDown,'Move later',()=>move(index,1),index===pages.length-1],[RotateCw,'Rotate',()=>changePages(pages.map((item,i)=>i===index?{...item,rotation:(item.rotation+90)%360}:item)),false],[Trash2,'Remove',()=>changePages(pages.filter((_,i)=>i!==index)),pages.length===1]].map(([Icon,label,action,disabled])=><button key={label} type="button" aria-label={`${label} page ${page.index+1}`} title={`${label} page ${page.index+1}`} disabled={busy||disabled} onClick={action} className="flex h-11 w-11 items-center justify-center rounded-lg border bg-white text-slate-600 focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-30"><Icon size={17}/></button>)}</div></article>)}</div></div>}
      <label className="block font-semibold">Output file name<input aria-label="Output file name" className={input} value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
      <div className="flex flex-wrap gap-3"><button className={`${button} w-full sm:w-auto`} disabled={busy||!file||(kind==='organize'&&!pages.length)} onClick={convert}>{busy?'Working…':kind==='organize'?'Save organized PDF':kind==='split'?'Split PDF':kind==='compresspdf'?'Compress PDF':'Convert document'}</button>{busy&&<button className="min-h-[44px] rounded-xl border px-5" onClick={()=>task.current?.abort()}>Cancel</button>}</div>
      <p role="status" aria-live="polite" className="break-words text-sm text-slate-600">{status}</p>
      {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result&&<div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p className="flex items-center gap-2 font-semibold text-emerald-900"><FileCheck2 size={18}/>Ready to download</p>{result.notice&&<p className="text-sm text-emerald-800">{result.notice}</p>}<button className={button} onClick={()=>downloadBlob(result.blob,name,result.extension)}>Download {result.extension.toUpperCase()}</button></div>}
    </div>
  </section>;
}
