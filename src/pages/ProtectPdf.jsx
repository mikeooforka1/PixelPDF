import React, {useEffect, useRef, useState} from 'react';
import {Lock, Download, ShieldCheck} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import {protectPdf} from '../utils/protectPdf';

export default function ProtectPdf() {
  const [file,setFile]=useState(null), [password,setPassword]=useState(''), [confirm,setConfirm]=useState('');
  const [show,setShow]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState(''), [output,setOutput]=useState(null);
  const abort=useRef(null), mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;abort.current?.abort();};},[]);
  useEffect(()=>()=>{if(output) URL.revokeObjectURL(output);},[output]);
  const changePassword=value=>{setPassword(value);setOutput(null);setError('');};
  async function run(event) {
    event.preventDefault();setError('');setOutput(null);
    if(!file) {setError('Choose a PDF first.');return;}
    if(!password.trim() || new TextEncoder().encode(password).length>127) {setError('Enter a password with 1–127 UTF-8 bytes. Spaces alone are not a password.');return;}
    if(password!==confirm) {setError('The passwords do not match.');return;}
    const controller=new AbortController();abort.current=controller;setBusy(true);
    let task;
    try {
      const bytes=await file.arrayBuffer();
      if(controller.signal.aborted) return;
      task=pdfjs.getDocument({data:new Uint8Array(bytes.slice(0)),isEvalSupported:false});
      // Reject protected inputs and cancel validation without a password prompt.
      const document=await new Promise((resolve,reject)=>{
        const cancel=()=>reject(new DOMException('Cancelled','AbortError'));
        controller.signal.addEventListener('abort',cancel,{once:true});
        const finish=(callback,value)=>{controller.signal.removeEventListener('abort',cancel);callback(value);};
        task.onPassword=()=>finish(reject,new Error('This PDF is already password protected. Upload an unprotected copy.'));
        task.promise.then(value=>finish(resolve,value),error=>finish(reject,error));
      });
      if(!document.numPages) throw new Error('This PDF has no pages.');
      await task.destroy();task=null;
      if(controller.signal.aborted) return;
      const result=await protectPdf(bytes,password,controller.signal);
      if(mounted.current && !controller.signal.aborted) {setOutput(URL.createObjectURL(new Blob([result],{type:'application/pdf'})));setPassword('');setConfirm('');}
    } catch(e) {
      if(mounted.current && !controller.signal.aborted) setError(e.name==='PasswordException'||/password|destroyed/i.test(e.message)?'This PDF is already password protected. Upload an unprotected copy.':e.message||'This file could not be read as a PDF.');
    } finally {if(task) await task.destroy().catch(()=>{});if(mounted.current) setBusy(false);}
  }
  const field='min-h-[44px] w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-violet-300';
  return <section className="mx-auto w-full min-w-0 max-w-2xl rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8">
    <div className="mb-4 inline-flex rounded-2xl bg-violet-50 p-3 text-violet-600"><Lock size={26}/></div>
    <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Protect PDF</h1>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">Add an opening password to your PDF. Anyone opening the downloaded copy will need that password.</p>
    <form onSubmit={run} className="mt-6 space-y-5">
      <label className="block text-sm font-semibold text-slate-700">1. Choose a PDF
        <input type="file" accept=".pdf,application/pdf" disabled={busy} className={`${field} mt-2`} onChange={event=>{setError('');setOutput(null);const next=event.target.files?.[0];if(next && (next.size>50*1024*1024 || !next.size)){setFile(null);setError('Choose a non-empty PDF smaller than 50 MB.');event.target.value='';}else setFile(next||null);}}/>
        <span className="mt-2 block text-xs font-normal text-slate-500">Up to 50 MB. Your original file stays unchanged.</span>
      </label>
      <label className="block text-sm font-semibold text-slate-700">2. Set an opening password
        <input type={show?'text':'password'} autoComplete="new-password" disabled={busy} value={password} onChange={e=>changePassword(e.target.value)} className={`${field} mt-2`} aria-describedby="password-help"/>
      </label>
      <p id="password-help" className="text-xs leading-relaxed text-slate-500">Use a unique password of at least 12 characters. Save it somewhere safe: PixelPDF cannot recover a forgotten password.</p>
      <label className="block text-sm font-semibold text-slate-700">Confirm password
        <input type={show?'text':'password'} autoComplete="new-password" disabled={busy} value={confirm} onChange={e=>{setConfirm(e.target.value);setOutput(null);}} className={`${field} mt-2`}/>
      </label>
      <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-600"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>Show passwords</label>
      {error && <p role="alert" className="break-words rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button disabled={busy||!file||!password||!confirm} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white disabled:opacity-50"><ShieldCheck size={18}/>{busy?'Protecting PDF…':'Protect PDF'}</button>
      {busy && <button type="button" onClick={()=>abort.current?.abort()} className="min-h-[44px] w-full rounded-xl border border-slate-200 px-4 py-2 text-sm">Cancel</button>}
    </form>
    {output && <div role="status" className="mt-5 rounded-2xl bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-800">Your protected PDF is ready.</p><a href={output} download={`${file.name.replace(/\.pdf$/i,'')}-protected.pdf`} className="mt-3 flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white"><Download size={18}/>Download protected PDF</a></div>}
    <p className="mt-5 text-xs leading-relaxed text-slate-500">Encryption happens on your device. Files and passwords are never uploaded. Existing digital signatures may be invalidated by rewriting a PDF.</p>
  </section>;
}
