import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf';
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ''}/pdfjs/pdf.worker.min.js`;

const escapeXml = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const colName = index => { let value = index + 1, name = ''; while(value){value--;name = String.fromCharCode(65 + value % 26) + name;value = Math.floor(value / 26);}return name; };
export function groupPdfText(items) {
  const tokens = items.filter(i => typeof i.str === 'string' && i.str.trim() && i.transform && Number.isFinite(i.transform[4]) && Number.isFinite(i.transform[5]))
    .map(i => ({text:i.str.trim(), x:i.transform[4], y:i.transform[5], width:Math.max(1,i.width||0), height:Math.max(8,Math.abs(i.height||i.transform[3]||10))})).sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows=[];
  for(const token of tokens){let row=rows.find(r=>Math.abs(r.y-token.y)<=Math.max(3,Math.min(7,token.height*.4)));if(!row){row={y:token.y,tokens:[]};rows.push(row);}row.tokens.push(token);}
  return rows.sort((a,b)=>b.y-a.y).map(r=>{
    const cells=[], ordered=r.tokens.sort((a,b)=>a.x-b.x);let previous=null;
    for(const t of ordered){const gap=previous?t.x-(previous.x+previous.width):0;const threshold=Math.max(12,t.height*1.4);if(previous&&gap<=threshold){cells[cells.length-1]+=(gap>3?' ':'')+t.text;}else cells.push(t.text);previous=t;}
    return cells;
  }).filter(row=>row.length);
}
export async function pdfToExcel(file, signal, onProgress=()=>{}) {
  if(!file || file.size===0 || file.size>50*1048576)throw Error('Choose a PDF smaller than 50 MB.');
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:`${process.env.PUBLIC_URL || ''}/pdf-assets/cmaps/`,cMapPacked:true});
  const cancel=()=>task.destroy().catch(()=>{});signal?.addEventListener('abort',cancel,{once:true});
  try {
    const doc=await task.promise;if(doc.numPages>200)throw Error('Use a PDF with 200 pages or fewer.');
    const sheets=[];let found=0;
    for(let p=1;p<=doc.numPages;p++){
      if(signal?.aborted)throw Error('Conversion cancelled.');onProgress(`Reading page ${p} of ${doc.numPages}…`);
      const page=await doc.getPage(p);const content=await page.getTextContent();const rows=groupPdfText(content.items);found+=rows.reduce((n,r)=>n+r.length,0);sheets.push(rows);
    }
    if(!found)throw Error('No selectable text found. This PDF appears to contain scanned images. Use Scan to Document first; image-only tables need OCR and manual review.');
    const zip=new JSZip();
    zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
    zip.file('_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((_,i)=>`<sheet name="Page ${i+1}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`);
    sheets.forEach((rows,i)=>zip.file(`xl/worksheets/sheet${i+1}.xml`,`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>`<c r="${colName(c)}${r+1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    return {blob,extension:'xlsx',notice:`Extracted ${sheets.length} page(s) into separate worksheets. Text is preserved as text, not formulas. Columns are inferred from visual spacing; review alignment, especially for complex tables.`};
  } finally {signal?.removeEventListener('abort',cancel);await task.destroy().catch(()=>{});}
}
