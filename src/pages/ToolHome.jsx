import React,{useState} from 'react';
import {ArrowUpRight,Search,ShieldCheck,WifiOff,Sparkles,Lock,Phone,Mail,Heart,ArrowLeft,MessageCircle} from 'lucide-react';
const categories=[['all','All tools'],['create','Create & convert'],['pdf','Manage PDFs'],['scan','Scan & extract'],['other','Images & drawing']];
export default function ToolHome({tools,onSelect}) {
  const [page,setPage]=useState('tools');
  const tabStyle=active=>`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200 ${active?'bg-white text-violet-700 shadow-sm':'text-slate-500 hover:text-slate-900'}`;
  const [query,setQuery]=useState(''),[category,setCategory]=useState('all');
  const homeTools=tools.some(tool=>tool.id==='protect')?tools:[...tools,{id:'protect',label:'Protect PDF',icon:Lock,desc:'Set a password required to open your downloaded PDF.',group:'pdf'}];
  const filtered=homeTools.filter(tool=>(category==='all'||tool.group===category)&&`${tool.label} ${tool.desc}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="mx-auto w-full min-w-0 max-w-6xl space-y-8 pb-8 sm:space-y-10">
    <div aria-label="Home sections" className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-1 sm:w-fit">
      <button type="button" aria-pressed={page==='tools'} onClick={()=>setPage('tools')} className={tabStyle(page==='tools')}>Tools</button>
      <button type="button" aria-pressed={page==='contact'} onClick={()=>setPage('contact')} className={tabStyle(page==='contact')}><MessageCircle size={16}/>Contact</button>
    </div>
    {page==='tools'?<>
    <div className="relative isolate overflow-hidden rounded-3xl border border-violet-100 bg-white px-5 py-8 shadow-sm sm:px-10 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-28 -z-10 h-96 w-96 rounded-full bg-violet-100/80 blur-3xl"/><div aria-hidden="true" className="pointer-events-none absolute -bottom-32 left-1/3 -z-10 h-80 w-80 rounded-full bg-sky-100/80 blur-3xl"/>
      <div className="min-w-0">
        <div className="min-w-0"><p className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-xs font-bold tracking-wide text-violet-700"><Sparkles size={14} className="shrink-0"/>Your everyday document workspace</p>
          <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl">Less file trouble.<br/><span className="text-violet-600">More getting it done.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">Scan a page, tidy a PDF, or turn a document into something easier to share. Pick a tool below and we’ll guide you from file to finish.</p>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-slate-600"><span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-violet-600"/>Browser tools keep files on your device</span><span className="inline-flex items-center gap-2"><WifiOff size={16} className="text-sky-600"/>Prepare once for offline use</span></div>
        </div>
      </div>
    </div>
    <div className="min-w-0 space-y-5 px-5 sm:px-10"><div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between"><div className="min-w-0"><h2 className="text-2xl font-bold tracking-tight text-slate-900">What would you like to do?</h2><p className="mt-1 text-sm text-slate-500">One task per tool. Choose a card to get started.</p></div><label className="relative block w-full md:max-w-xs md:shrink-0"><span className="sr-only">Find a tool</span><Search aria-hidden="true" size={18} className="absolute left-3 top-3.5 text-slate-400"/><input aria-label="Find a tool" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a tool…" className="min-h-[44px] w-full min-w-0 rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-violet-200"/></label></div>
      <div aria-label="Tool categories" className="flex flex-wrap gap-2">{categories.map(([value,label])=><button key={value} aria-pressed={category===value} onClick={()=>setCategory(value)} className={`min-h-[44px] rounded-full border px-4 py-2 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-violet-300 ${category===value?'border-violet-600 bg-violet-600 text-white':'border-slate-200 bg-white text-slate-600 hover:border-violet-200'}`}>{label}</button>)}</div>
      <div className="grid min-w-0 auto-rows-fr grid-cols-1 items-stretch gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filtered.map(({id,label,icon:Icon,desc,group})=><button key={id} onClick={()=>onSelect(id)} aria-label={`Open ${label}`} className="group flex h-full min-h-[174px] min-w-0 flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"><div className="mb-4 flex w-full shrink-0 items-center justify-between"><span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${group==='scan'?'bg-amber-50 text-amber-600':group==='pdf'?'bg-sky-50 text-sky-600':group==='other'?'bg-emerald-50 text-emerald-600':'bg-violet-50 text-violet-600'}`}><Icon size={22}/></span><ArrowUpRight size={16} className="text-slate-300 transition group-hover:text-violet-600"/></div><span className="min-h-[3rem] w-full break-words text-base font-bold leading-6 text-slate-900">{label}</span><span className="mt-2 w-full break-words text-sm leading-relaxed text-slate-500">{desc}</span></button>)}</div>
      {!filtered.length&&<p role="status" className="rounded-2xl border border-dashed bg-white p-8 text-center text-slate-500">No matching tools. Try “PDF”, “scan” or clear your search.</p>}
    </div>
    <p className="rounded-2xl border border-slate-200 bg-white/70 px-5 py-4 text-xs sm:px-10 leading-relaxed text-slate-500">Browser tools work on your device. Optional Python scanning sends page images to your configured backend and requires access to that backend. Office conversions support common content; review the tool’s formatting notes before sharing a converted file.</p>
    <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-violet-100 bg-white px-5 py-5 sm:flex-row sm:items-center sm:px-10">
      <div><p className="text-sm font-semibold text-slate-800">Made to make your document work easier.</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Have a question, an idea, or want to support PixelPDF?</p></div>
      <a href="#pixelpdf-contact" onClick={event=>{event.preventDefault();setPage('contact');}} className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200"><Heart size={16}/>Support PixelPDF<ArrowUpRight size={16}/></a>
    </div>
    </>:<div id="pixelpdf-contact" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-violet-50 via-white to-sky-50 px-5 py-8 sm:px-10 sm:py-10">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-violet-600">Contact & support</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Let’s talk.</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">Questions about PixelPDF, feedback, or interested in supporting the project? Get in touch with Michael Oforka using the details below.</p>
      </div>
      <div className="space-y-6 px-5 py-6 sm:px-10 sm:py-8">
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <a href="tel:+2348143316441" className="group flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200 p-5 transition hover:border-violet-300 hover:bg-violet-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-200">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Phone size={21}/></span>
            <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</span><span className="mt-2 block break-all text-base font-semibold text-slate-900">+2348143316441</span><span className="mt-2 block text-xs text-slate-500">Tap to call<ArrowUpRight size={13} className="ml-1 inline"/></span></span>
          </a>
          <a href="mailto:mikeoforka7@gmail.com" className="group flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200 p-5 transition hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Mail size={21}/></span>
            <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span><span className="mt-2 block break-all text-base font-semibold text-slate-900">mikeoforka7@gmail.com</span><span className="mt-2 block text-xs text-slate-500">Send an email<ArrowUpRight size={13} className="ml-1 inline"/></span></span>
          </a>
        </div>
        <p className="rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">For a technical issue, include the tool name, your device and browser, and what happened. Keep passwords and confidential documents out of your message.</p>
        <button type="button" onClick={()=>setPage('tools')} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-violet-200"><ArrowLeft size={16}/>Back to tools</button>
      </div>
    </div>}
  </section>;
}
