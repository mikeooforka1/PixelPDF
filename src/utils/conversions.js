import JSZip from 'jszip';
import {jsPDF} from 'jspdf';
import {PDFDocument, degrees} from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';
import {safeName} from './documentExport';
const MAX_FILE = 50 * 1048576;
const MAX_PAGES = 200;
const nodes = (root, name) => Array.from(root.getElementsByTagNameNS('*', name));
const first = (root, name) => nodes(root,name)[0];
const attr = (node, name) => node?.getAttribute(name) || Array.from(node?.attributes || []).find(a => a.localName===name)?.value || '';
const content = root => nodes(root,'t').map(n=>n.textContent).join('');
const abort = signal => {if(signal?.aborted){const error=new Error('Conversion cancelled.');error.name='AbortError';throw error;}};
const tick = () => new Promise(resolve=>setTimeout(resolve,0));
export function checkFile(file, extension) {
  if(!file || !file.size) throw Error('Choose a non-empty document.');
  if(file.size>MAX_FILE) throw Error('Use a file smaller than 50 MB.');
  if(!file.name.toLowerCase().endsWith('.'+extension)) throw Error(`Choose a .${extension} file. For older Office formats, save a copy in the modern format first.`);
}
export function parseRanges(value,total) {
  if(!value.trim())throw Error('Enter page numbers, for example 1-3, 5.');
  const pages=new Set();
  for(const part of value.split(',')) {
    const match=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if(!match)throw Error('Use page numbers and ranges such as 1-3, 5.');
    const start=Number(match[1]),end=Number(match[2]||match[1]);
    if(start<1||end<start||end>total)throw Error(`Page ranges must be between 1 and ${total}, in ascending order.`);
    for(let p=start;p<=end;p++)pages.add(p-1);
  }
  return [...pages].sort((a,b)=>a-b);
}
export async function splitPdf(file,ranges,separate,signal,onProgress) {
  checkFile(file,'pdf');const original=await PDFDocument.load(await file.arrayBuffer());abort(signal);
  const total=original.getPageCount();if(total>MAX_PAGES)throw Error('Split up to 200 pages at a time.');
  const selected=separate?Array.from({length:total},(_,i)=>i):parseRanges(ranges,total);
  const zip=separate?new JSZip():null;
  const combined=await PDFDocument.create();
  for(let i=0;i<selected.length;i++) {
    abort(signal);const output=separate?await PDFDocument.create():combined;
    const [page]=await output.copyPages(original,[selected[i]]);output.addPage(page);
    if(separate)zip.file(`page-${String(selected[i]+1).padStart(3,'0')}.pdf`,await output.save());
    onProgress?.(`Copying page ${i+1}/${selected.length}`);await tick();
  }
  abort(signal);
  return separate?{blob:await zip.generateAsync({type:'blob',compression:'DEFLATE'}),extension:'zip'}:{blob:new Blob([await combined.save()],{type:'application/pdf'}),extension:'pdf'};
}
export async function loadPdf(file) {
  checkFile(file,'pdf');
  const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:`${process.env.PUBLIC_URL}/pdf-assets/cmaps/`,cMapPacked:true,standardFontDataUrl:`${process.env.PUBLIC_URL}/pdf-assets/standard_fonts/`}).promise;
  if(doc.numPages>MAX_PAGES){await doc.destroy();throw Error('Convert up to 200 PDF pages at a time.');}return doc;
}
async function renderPdfPage(doc,index,width,signal) {
  abort(signal);const page=await doc.getPage(index),original=page.getViewport({scale:1});
  const scale=Math.min(width/original.width,2200/original.height),viewport=page.getViewport({scale});
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
  const task=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'});
  const cancel=()=>task.cancel();signal?.addEventListener('abort',cancel,{once:true});
  try{await task.promise;abort(signal);return {canvas,width:original.width,height:original.height};}
  catch(error){canvas.width=canvas.height=1;abort(signal);throw error;}
  finally{signal?.removeEventListener('abort',cancel);page.cleanup();}
}
export async function compressPdf(file,mode,signal,onProgress) {
  checkFile(file,'pdf');let blob;
  if(mode==='lossless') {
    const doc=await PDFDocument.load(await file.arrayBuffer());abort(signal);
    blob=new Blob([await doc.save({useObjectStreams:true})],{type:'application/pdf'});
  } else {
    const doc=await loadPdf(file);let output;
    try{
      for(let i=1;i<=doc.numPages;i++) {
        onProgress?.(`Optimizing page ${i}/${doc.numPages}`);
        const page=await renderPdfPage(doc,i,mode==='small'?1000:1600,signal);
        try{
          const options={unit:'pt',format:[page.width,page.height],orientation:page.width>page.height?'landscape':'portrait',compress:true};
          if(!output)output=new jsPDF(options);else output.addPage(options.format,options.orientation);
          output.addImage(page.canvas.toDataURL('image/jpeg',mode==='small'?.58:.78),'JPEG',0,0,page.width,page.height);
        }finally{page.canvas.width=page.canvas.height=1;}
        await tick();
      }
      blob=output.output('blob');
    }finally{await doc.destroy();}
  }
  abort(signal);
  if(blob.size>=file.size)return{blob:file,extension:'pdf',notice:'This document is already compact. The original is kept because the converted file would be larger.'};
  return{blob,extension:'pdf',notice:`Reduced by ${Math.round((1-blob.size/file.size)*100)}% · ${(file.size/1048576).toFixed(2)} MB → ${(blob.size/1048576).toFixed(2)} MB`};
}
let pptLibrary;
async function loadPptx() {
  if(window.PptxGenJS || window.pptxgen)return window.PptxGenJS || window.pptxgen;
  if(!pptLibrary)pptLibrary=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=`${process.env.PUBLIC_URL}/pwa-libs/pptxgen.bundle.js`;
    const timeout=setTimeout(()=>{script.remove();pptLibrary=null;reject(Error('PowerPoint support is not ready. Prepare offline tools or reconnect and retry.'));},15000);
    script.onload=()=>{clearTimeout(timeout);if(window.PptxGenJS || window.pptxgen)resolve(window.PptxGenJS || window.pptxgen);else{pptLibrary=null;reject(Error('PowerPoint support could not load.'));}};
    script.onerror=()=>{clearTimeout(timeout);script.remove();pptLibrary=null;reject(Error('PowerPoint support could not load. Prepare the app while online.'));};document.head.appendChild(script);
  });return pptLibrary;
}
export async function pdfToPptx(file,signal,onProgress) {
  const Constructor=await loadPptx();abort(signal);const output=new Constructor(),doc=await loadPdf(file);
  let slideWidth,slideHeight;
  output.author='PixelPDF';output.subject='PDF pages preserved as slide images';output.title=file.name;
  try{
    for(let i=1;i<=doc.numPages;i++) {
      onProgress?.(`Creating slide ${i}/${doc.numPages}`);const page=await renderPdfPage(doc,i,1600,signal);
      try{
        // A presentation has one slide size; fit differently sized PDF pages inside it.
        if(i===1){slideWidth=page.width/72;slideHeight=page.height/72;output.defineLayout({name:'PDF_PAGE',width:page.width/72,height:page.height/72});output.layout='PDF_PAGE';}
        const slide=output.addSlide();slide.background={color:'FFFFFF'};
        const data=page.canvas.toDataURL('image/jpeg',.9);
        const ratio=Math.min(slideWidth/page.width,slideHeight/page.height),w=page.width*ratio,h=page.height*ratio;
        slide.addImage({data,x:(slideWidth-w)/2,y:(slideHeight-h)/2,w,h});

      }finally{page.canvas.width=page.canvas.height=1;}
      await tick();abort(signal);
    }
    return{blob:await output.write({outputType:'blob',compression:true}),extension:'pptx'};
  }finally{await doc.destroy();}
}
export function parseXml(xml) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('This document contains unsupported XML declarations.');
  const parsed=new DOMParser().parseFromString(xml,'application/xml');
  if(parsed.getElementsByTagName('parsererror').length)throw Error('This Office document contains damaged XML.');return parsed;
}
async function archive(file,extension) {
  checkFile(file,extension);let zip;
  try{zip=await JSZip.loadAsync(await file.arrayBuffer());}catch{throw Error('This Office document is damaged or encrypted. Save an unprotected copy in Office and retry.');}
  let expanded=0;
  for(const entry of Object.values(zip.files)){expanded+=entry._data?.uncompressedSize||0;if(expanded>100*1048576)throw Error('This Office file expands beyond the 100 MB safety limit. Split it into smaller documents.');}
  return zip;
}
async function xml(zip,path,optional=false) {
  const entry=zip.file(path);if(!entry){if(optional)return null;throw Error('Required Office content is missing: '+path);}
  if(entry._data?.uncompressedSize>20*1048576)throw Error('An Office content part is too large. Split the document.');return parseXml(await entry.async('string'));
}
function resolvePart(base,target) {
  if(!target||/^\w+:|^\/\//.test(target))return null;
  const parts=target.startsWith('/')?[]:base.split('/').slice(0,-1);
  for(const part of target.split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);}return parts.join('/');
}
async function relationships(zip,path) {
  const filename=path.split('/').pop(),dir=path.slice(0,-filename.length);
  const doc=await xml(zip,`${dir}_rels/${filename}.rels`,true);const result={};
  if(doc)for(const rel of nodes(doc,'Relationship'))if(attr(rel,'TargetMode')!=='External')result[attr(rel,'Id')]=resolvePart(path,attr(rel,'Target'));
  return result;
}
async function readImage(zip,path) {
  if(!path || !/\.(png|jpe?g|gif|bmp|webp)$/i.test(path))return null;
  const entry=zip.file(path);if(!entry)return null;
  if(entry._data?.uncompressedSize>20*1048576)throw Error('An embedded image is too large. Resize it in Office and retry.');
  const url=URL.createObjectURL(await entry.async('blob'));
  try{return await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{if(image.naturalWidth*image.naturalHeight>25000000)reject(Error('An embedded image exceeds 25 million pixels.'));else resolve(image);};image.onerror=()=>reject(Error('An embedded image could not be decoded.'));image.src=url;});}
  finally{URL.revokeObjectURL(url);}
}
function newCanvas(width=1240,height=1754) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,width,height);context.fillStyle='#172033';context.font='24px Arial';return{canvas,context};
}
export function wrapText(context,text,width) {
  // Avoid exporting missing-glyph boxes when the browser has no script font.
  if (/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u024f\u0300-\u036f\u1e00-\u1eff\u2000-\u206f\u20a0-\u20cf\u2190-\u22ff\ufb00-\ufb06]/.test(String(text))) throw Error('This browser Office converter supports Latin-script text. Use Office’s PDF export for this script to preserve readable characters.');
  const lines=[];
  for(const paragraph of String(text).split('\n')) {
    let line='';
    for(const word of paragraph.split(/\s+/)) {
      if(context.measureText(word).width>width) {
        if(line){lines.push(line);line='';}
        for(const character of Array.from(word)){if(context.measureText(line+character).width>width&&line){lines.push(line);line='';}line+=character;}
      } else if(line&&context.measureText(line+' '+word).width>width){lines.push(line);line=word;}
      else line+=(line?' ':'')+word;
    }
    lines.push(line);
  }return lines;
}
class PagedPdf {
  constructor(landscape=false){this.landscape=landscape;this.count=0;this.pdf=null;this.start();}
  start(){const{canvas,context}=newCanvas(this.landscape?1754:1240,this.landscape?1240:1754);this.canvas=canvas;this.ctx=context;this.y=80;}
  save(){if(++this.count>MAX_PAGES)throw Error('The output exceeds 200 pages. Split the source document.');if(!this.pdf)this.pdf=new jsPDF({orientation:this.landscape?'landscape':'portrait',compress:true});else this.pdf.addPage(undefined,this.landscape?'landscape':'portrait');this.pdf.addImage(this.canvas.toDataURL('image/jpeg',.95),'JPEG',0,0,this.landscape?297:210,this.landscape?210:297);this.canvas.width=this.canvas.height=1;}
  next(){this.save();this.start();}
  text(text,size=24,bold=false){this.ctx.font=`${bold?'bold ':''}${size}px Arial`;const lines=wrapText(this.ctx,text,this.canvas.width-160);for(const line of lines){if(this.y+size*1.5>this.canvas.height-80)this.next();this.ctx.font=`${bold?'bold ':''}${size}px Arial`;this.ctx.fillStyle='#172033';this.ctx.fillText(line,80,this.y+size);this.y+=size*1.5;}this.y+=12;}
  table(rows){if(!rows.length)return;const columns=Math.max(...rows.map(row=>row.length)),width=(this.canvas.width-160)/columns;
    for(const row of rows){this.ctx.font='20px Arial';const values=Array.from({length:columns},(_,i)=>wrapText(this.ctx,row[i]||'',width-20));const lineCount=Math.max(...values.map(value=>value.length));
      for(let offset=0;offset<lineCount;){let capacity=Math.floor((this.canvas.height-80-this.y-20)/28);if(capacity<1){this.next();capacity=Math.floor((this.canvas.height-80-this.y-20)/28);}const lines=Math.min(capacity,lineCount-offset),height=lines*28+20;
        for(let col=0;col<columns;col++){this.ctx.strokeStyle='#cbd5e1';this.ctx.strokeRect(80+col*width,this.y,width,height);this.ctx.fillStyle='#172033';this.ctx.font='20px Arial';values[col].slice(offset,offset+lines).forEach((line,i)=>this.ctx.fillText(line,90+col*width,this.y+28+i*28));}
        this.y+=height;offset+=lines;
      }
    }this.y+=20;
  }
  image(image){const ratio=Math.min(1,(this.canvas.width-160)/image.naturalWidth,(this.canvas.height-160)/image.naturalHeight),width=image.naturalWidth*ratio,height=image.naturalHeight*ratio;if(this.y+height>this.canvas.height-80)this.next();this.ctx.drawImage(image,80,this.y,width,height);this.y+=height+20;}
  finish(){this.save();return this.pdf.output('blob');}
}
function paragraphText(paragraph) {
  const parts=[];const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_ELEMENT);
  let node;while((node=walker.nextNode())){if(node.localName==='t')parts.push(node.textContent);if(node.localName==='tab')parts.push('\t');if(node.localName==='br')parts.push('\n');}return parts.join('');
}
export async function wordToPdf(file,signal,onProgress) {
  const zip=await archive(file,'docx'),doc=await xml(zip,'word/document.xml'),body=first(doc,'body');if(!body)throw Error('This Word file has no document body.');
  const rels=await relationships(zip,'word/document.xml'),output=new PagedPdf();let count=0;
  try{
    for(const element of body.children){abort(signal);onProgress?.(`Reading Word block ${++count}`);
      if(element.localName==='p') {
        const text=paragraphText(element),style=attr(first(element,'pStyle'),'val'),size=/Heading1/i.test(style)?36:/Heading/i.test(style)?28:24;
        if(text)output.text((first(element,'numPr')?'• ':'')+text,size,/Heading/i.test(style));
        for(const blip of nodes(element,'blip')){const image=await readImage(zip,rels[attr(blip,'embed')]);if(image)output.image(image);}
        if(nodes(element,'br').some(node=>attr(node,'type')==='page'))output.next();
      }else if(element.localName==='tbl')output.table(nodes(element,'tr').map(row=>Array.from(row.children).filter(node=>node.localName==='tc').map(cell=>nodes(cell,'p').map(paragraphText).join('\n'))));
      await tick();
    }
    abort(signal);return{blob:output.finish(),extension:'pdf'};
  }finally{output.canvas.width=output.canvas.height=1;}
}
export function columnIndex(reference) {
  const match=reference.match(/^[A-Z]+/i);if(!match)throw Error('Invalid spreadsheet cell reference.');return [...match[0].toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
}
export function displayNumber(value,format,date1904=false) {
  const number=Number(value);if(!Number.isFinite(number)||!format)return String(value??'');
  const clean=format.replace(/"[^"]*"/g,'').replace(/\\./g,'');
  if(/[yd]/i.test(clean)&&/[m]/i.test(clean)){
    if(!date1904&&Math.floor(number)===60)return '1900-02-29';
    const base=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,number<60?31:30);
    return new Date(base+number*86400000).toISOString().slice(0,10);
  }
  const decimal=format.match(/\.([0#]+)/),places=Math.min(10,decimal?decimal[1].length:0);
  if(format.includes('%'))return(number*100).toFixed(places)+'%';
  if(/[0#]/.test(format)){
    const currency=format.match(/[$€£]/)?.[0]||'';
    const formatted=number.toLocaleString('en-US',{minimumFractionDigits:places,maximumFractionDigits:places,useGrouping:format.includes(',')});
    return currency+formatted;
  }return String(value);
}
export async function excelToPdf(file,signal,onProgress) {
  const zip=await archive(file,'xlsx'),book=await xml(zip,'xl/workbook.xml'),rels=await relationships(zip,'xl/workbook.xml');
  const shared=await xml(zip,'xl/sharedStrings.xml',true),strings=shared?nodes(shared,'si').map(content):[];
  const styles=await xml(zip,'xl/styles.xml',true),custom={};
  if(styles)for(const entry of nodes(styles,'numFmt'))custom[attr(entry,'numFmtId')]=attr(entry,'formatCode');
  const builtins={9:'0%',10:'0.00%',14:'m/d/yy',15:'d-mmm-yy',16:'d-mmm',17:'mmm-yy',22:'m/d/yy h:mm',1:'0',2:'0.00',3:'#,##0',4:'#,##0.00'};
  const formats=styles&&first(styles,'cellXfs')?Array.from(first(styles,'cellXfs').children).map(entry=>custom[attr(entry,'numFmtId')]||builtins[attr(entry,'numFmtId')]||''):[];
  const date1904=attr(first(book,'workbookPr'),'date1904')==='1';
  const output=new PagedPdf(true);let sheetCount=0,totalCells=0;
  try{
    for(const sheet of nodes(book,'sheet')) {
      abort(signal);const path=rels[attr(sheet,'id')];if(!path)throw Error('A worksheet link is missing.');
      const doc=await xml(zip,path);onProgress?.(`Reading worksheet ${attr(sheet,'name')}`);const rows=[];let maxColumn=0;
      for(const row of nodes(doc,'row')) {
        const values=[];
        for(const cell of nodes(row,'c')) {
          if(++totalCells>20000)throw Error('Convert up to 20,000 populated cells at a time. Split this workbook.');
          const index=columnIndex(attr(cell,'r'));if(index>=100)throw Error('Convert up to 100 columns per worksheet. Split this worksheet.');maxColumn=Math.max(maxColumn,index+1);
          const type=attr(cell,'t'),value=first(cell,'v')?.textContent,formula=first(cell,'f')?.textContent;
          values[index]=type==='s'?(strings[Number(value)]||''):type==='inlineStr'?content(cell):type==='b'?(value==='1'?'TRUE':'FALSE'):(value!==undefined&&value!==''&&type!=='str'&&type!=='e'?displayNumber(value,formats[Number(attr(cell,'s'))||0],date1904):value|| (formula?'='+formula:''));
        }
        if(values.some(value=>value!==''&&value!==undefined))rows.push(values);
      }
      if(sheetCount++)output.next();output.text(attr(sheet,'name')||'Worksheet',32,true);
      if(!rows.length)output.text('Empty worksheet');
      // Wide sheets are split into column panels; no populated cells are dropped.
      for(let start=0;start<maxColumn;start+=6){if(start){output.next();output.text(`${attr(sheet,'name')} · columns ${start+1}–${Math.min(start+6,maxColumn)}`,28,true);}output.table(rows.map(row=>Array.from({length:Math.min(6,maxColumn-start)},(_,i)=>row[start+i]||'')));abort(signal);await tick();}
    }
    if(!sheetCount)throw Error('This workbook has no worksheets.');abort(signal);return{blob:output.finish(),extension:'pdf'};
  }finally{output.canvas.width=output.canvas.height=1;}
}
export async function powerpointToPdf(file,signal,onProgress) {
  const zip=await archive(file,'pptx'),presentation=await xml(zip,'ppt/presentation.xml'),rels=await relationships(zip,'ppt/presentation.xml');
  const dimensions=first(presentation,'sldSz'),cx=Number(attr(dimensions,'cx'))||12192000,cy=Number(attr(dimensions,'cy'))||6858000;
  const slides=nodes(presentation,'sldId');if(!slides.length||slides.length>MAX_PAGES)throw Error('Use a presentation with 1–200 slides.');let pdf;
  for(let i=0;i<slides.length;i++) {
    abort(signal);onProgress?.(`Rendering slide ${i+1}/${slides.length}`);const path=rels[slides[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')];if(!path)throw Error('A slide link is missing.');
    const doc=await xml(zip,path),slideRels=await relationships(zip,path);const width=1600,height=Math.max(1,Math.round(1600*cy/cx));if(height>2400)throw Error('This slide aspect ratio is not supported.');
    const {canvas,context}=newCanvas(width,height);const factor=width/cx;
    try{
      const background=first(first(doc,'bg')||doc,'srgbClr');if(first(doc,'bg')&&background){context.fillStyle='#'+attr(background,'val');context.fillRect(0,0,width,height);}
      const tree=first(doc,'spTree');if(!tree)throw Error('A slide has no shape tree.');
      for(const shape of tree.children) {
        if(!['sp','pic'].includes(shape.localName))continue;
        const transform=first(shape,'xfrm'),off=transform&&first(transform,'off'),ext=transform&&first(transform,'ext');
        const x=Number(attr(off,'x'))*factor,y=Number(attr(off,'y'))*factor,w=Number(attr(ext,'cx'))*factor||width-160,h=Number(attr(ext,'cy'))*factor||height-160;
        if(shape.localName==='pic'){const image=await readImage(zip,slideRels[attr(first(shape,'blip'),'embed')]);if(image)context.drawImage(image,x,y,w,h);}
        else {
          const fill=first(shape,'spPr')&&first(first(shape,'spPr'),'solidFill'),color=fill&&first(fill,'srgbClr');if(color){context.fillStyle='#'+attr(color,'val');context.fillRect(x,y,w,h);}
          let cursor=y+8;
          for(const paragraph of nodes(shape,'p')) {
            const text=content(paragraph);if(!text)continue;
            const props=first(paragraph,'rPr')||first(paragraph,'defRPr'),size=Math.max(12,(Number(attr(props,'sz'))||2400)/100*cx/12192000*factor*914400/72);
            context.font=`${attr(props,'b')==='1'?'bold ':''}${size}px Arial`;const textColor=props&&first(props,'srgbClr');context.fillStyle=textColor?'#'+attr(textColor,'val'):'#172033';
            for(const line of wrapText(context,text,Math.max(20,w-16))){context.fillText(line,x+8,cursor+size);cursor+=size*1.25;}
          }
        }
      }
      const page=[cx/914400*25.4,cy/914400*25.4],orientation=cx>cy?'landscape':'portrait';if(!pdf)pdf=new jsPDF({format:page,orientation,compress:true});else pdf.addPage(page,orientation);pdf.addImage(canvas.toDataURL('image/jpeg',.95),'JPEG',0,0,page[0],page[1]);
    }finally{canvas.width=canvas.height=1;}
    await tick();
  }
  abort(signal);return{blob:pdf.output('blob'),extension:'pdf'};
}
export function downloadBlob(blob,name,extension) {
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`${safeName(name)}.${extension}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function organizePdf(file,pages,signal,onProgress) {
  checkFile(file,'pdf');if(!pages.length)throw Error('Keep at least one page.');
  const source=await PDFDocument.load(await file.arrayBuffer()),result=await PDFDocument.create();
  for(let i=0;i<pages.length;i++){abort(signal);const item=pages[i];if(!Number.isInteger(item.index)||item.index<0||item.index>=source.getPageCount())throw Error('Invalid page selection.');const [page]=await result.copyPages(source,[item.index]);page.setRotation(degrees((page.getRotation().angle+item.rotation)%360));result.addPage(page);onProgress?.(`Saving page ${i+1}/${pages.length}`);await tick();}
  abort(signal);return{blob:new Blob([await result.save()],{type:'application/pdf'}),extension:'pdf'};
}
export async function pdfPreviews(file,signal,onProgress) {
  const doc=await loadPdf(file),pages=[];
  try{for(let i=1;i<=doc.numPages;i++){onProgress?.(`Reading page ${i}/${doc.numPages}`);const page=await renderPdfPage(doc,i,180,signal);try{pages.push({index:i-1,rotation:0,preview:page.canvas.toDataURL('image/jpeg',.7)});}finally{page.canvas.width=page.canvas.height=1;}await tick();}return pages;}finally{await doc.destroy();}
}
