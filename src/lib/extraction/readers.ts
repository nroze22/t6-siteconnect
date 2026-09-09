import JSZip from 'jszip';
import {checkOfficeZip} from './zip-policy';
import {digest,MAX_FILE_BYTES,MAX_TEXT,parserEntity,type Segment,type SourceFile} from './types';
import {splitSegment} from './review';
import {releaseRows} from './release';
function xml(text:string){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('XML entities are not supported.');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('Invalid XML document.');return doc;}
const elements=(node:Document|Element,name:string)=>Array.from(node.getElementsByTagNameNS('*',name));
async function zipText(zip:JSZip,name:string){const f=zip.file(name);if(!f)throw Error(`Missing document part: ${name}`);const text=await f.async('string');if(text.length>2000000)throw Error('Expanded document part is too large. Split the file.');return text;}
export function parseDelimited(text:string,separator=','):string[][]{
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else throw Error('Invalid quote in delimited input.');}else if(ch===separator&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';}else cell+=ch;}
 if(quoted)throw Error('Unclosed quoted field.');row.push(cell);if(row.some(v=>v!==''))rows.push(row);return rows;
}
export function cellsFromRows(rows:string[][],sheet='Sheet 1'):Segment[]{
 const headers=rows[0];if(!headers?.length)throw Error('No table header found.');
 if(new Set(headers).size!==headers.length||headers.some(h=>!h))throw Error('Use unique, nonempty column headers.');
 const segments:Segment[]=[];
 for(let r=1;r<rows.length;r++){if(rows[r]!.length!==headers.length)throw Error(`Row ${r+1} has a different number of columns than the header.`);
  rows[r]!.forEach((value,col)=>{if(value==='')return;let n=col+1;let letter='';while(n){n--;letter=String.fromCharCode(65+n%26)+letter;n=Math.floor(n/26);}segments.push({id:`${sheet}!${letter}${r+1}`,label:`${sheet} · ${letter}${r+1} · ${headers[col]}`,text:value});});
 }return segments;
}
function fhirSegments(value:unknown,path:string,segments:Segment[]){
 if(value===null||typeof value!=='object'){segments.push({id:path,label:path,text:value===null?'null':String(value)});return;}
 if(Array.isArray(value))value.forEach((v,i)=>fhirSegments(v,`${path}/${i}`,segments));else Object.entries(value).forEach(([k,v])=>fhirSegments(v,`${path}/${k.replaceAll('~','~0').replaceAll('/','~1')}`,segments));
}
export async function readSource(file:File,options:{allowImagePages?:boolean}={}):Promise<SourceFile>{
 if(file.size>MAX_FILE_BYTES)throw Error('File exceeds 12 MB. Split it into smaller synthetic examples.');
 if(!file.size)throw Error('This file is empty.');const bytes=await file.arrayBuffer();const hash=await digest(bytes);const ext=file.name.split('.').pop()!.toLowerCase();
 const out:SourceFile={name:file.name,hash,format:ext,segments:[],entities:[],warnings:[],mode:'narrative',original:''};
 const text=()=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
 if(['txt','md','markdown'].includes(ext)){out.original=text();out.segments=out.original.split(/\n\s*\n/).filter(t=>t.trim()).map((t,i)=>({id:`paragraph-${i+1}`,label:`Paragraph ${i+1}`,text:t}));}
 else if(ext==='pdf'){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=(await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
  const pdf=await pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
  try{if(pdf.numPages>30)throw Error('Limit this review to 30 pages per file.');
   for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const viewport=page.getViewport({scale:1});const content=await page.getTextContent();let str='';const runs:NonNullable<Segment['runs']>=[];
    for(const item of content.items){if(!('str' in item)||!item.str)continue;const start=str.length;str+=item.str;const transform=pdfjs.Util.transform(viewport.transform,item.transform);const height=Math.hypot(transform[2]!,transform[3]!);runs.push({start,end:str.length,box:{x:transform[4]!,y:transform[5]!-height,width:Math.max(1,item.width),height:Math.max(1,height)}});str+=item.hasEOL?'\n':' ';}
    if(!str.trim()){out.warnings.push(`Page ${p} has no readable text. OCR is required; image-only content is not extracted.`);if(!options.allowImagePages)continue;}
    const canvas=document.createElement('canvas');if(viewport.width*viewport.height>8000000)throw Error(`PDF page ${p} is too large to render safely.`);const renderView=page.getViewport({scale:Math.min(1.4,1400/viewport.width)});canvas.width=renderView.width;canvas.height=renderView.height;
    await page.render({canvas,viewport:renderView}).promise;
    out.segments.push({id:`page-${p}`,label:`PDF page ${p}`,text:str,page:p,runs,pageWidth:viewport.width,pageHeight:viewport.height,image:canvas.toDataURL('image/png')});
   }
  }finally{await pdf.destroy();}
  if(!out.segments.length)throw Error('This PDF contains no readable text. OCR is not configured; use a text PDF or export the source text.');
 }
 else if(ext==='docx'){
  checkOfficeZip(bytes);const zip=await JSZip.loadAsync(new Uint8Array(bytes));const doc=xml(await zipText(zip,'word/document.xml'));
  out.segments=elements(doc,'p').map((p,i)=>({id:`paragraph-${i+1}`,label:`Word paragraph ${i+1}`,text:elements(p,'t').map(t=>t.textContent||'').join('')})).filter(p=>p.text.trim());
  if(Object.keys(zip.files).some(n=>n.startsWith('word/media/')))out.warnings.push('Embedded images are not OCR processed. Review them in the original document.');
  if(elements(doc,'del').length||elements(doc,'ins').length)out.warnings.push('Tracked changes exist. Review the original Word document before accepting extracted content.');
  out.warnings.push('Paragraph text is preserved; the Word page layout is not reconstructed.');
 }
 else if(['csv','tsv'].includes(ext)){out.mode='structured';out.original=text();out.segments=cellsFromRows(parseDelimited(out.original,ext==='tsv'?'\t':','));}
 else if(ext==='xlsx'){
  out.mode='structured';checkOfficeZip(bytes);const zip=await JSZip.loadAsync(new Uint8Array(bytes));const wb=xml(await zipText(zip,'xl/workbook.xml'));const rel=xml(await zipText(zip,'xl/_rels/workbook.xml.rels'));const shared=zip.file('xl/sharedStrings.xml')?elements(xml(await zipText(zip,'xl/sharedStrings.xml')),'si').map(si=>elements(si,'t').map(t=>t.textContent||'').join('')):[];
  for(const sheet of elements(wb,'sheet')){const id=sheet.getAttribute('r:id');const target=elements(rel,'Relationship').find(r=>r.getAttribute('Id')===id)?.getAttribute('Target');if(!target||target.includes('..'))throw Error('Unsupported workbook relationship.');const path=target.startsWith('/')?target.slice(1):`xl/${target}`;const name=sheet.getAttribute('name')||'Sheet';const doc=xml(await zipText(zip,path));const headers=new Map<string,string>();
   for(const cell of elements(doc,'c')){const address=cell.getAttribute('r')||'';if(!/^[A-Z]+\d+$/.test(address))throw Error('Invalid workbook cell address.');const type=cell.getAttribute('t');const raw=elements(cell,'v')[0]?.textContent??'';const value=type==='s'?shared[Number(raw)]:type==='inlineStr'?elements(cell,'t').map(t=>t.textContent||'').join(''):raw;
    if(value===undefined)throw Error(`Invalid shared string at ${name}!${address}`);
    if(elements(cell,'f').length)out.warnings.push(`Formula at ${name}!${address}: cached value shown; recalculation is not performed.`);
    const column=address.replace(/\d+/,'');if(address.endsWith('1')&&Number(address.match(/\d+/)![0])===1)headers.set(column,value);
    else if(value!=='')out.segments.push({id:`${name}!${address}`,label:`${name} · ${address} · ${headers.get(column)||'Unlabeled column'}`,text:value});
   }
  }
  out.warnings.push('Excel stored values are preserved. Numeric date serials are not converted to dates; use ISO date strings for the laboratory release profile.');
 }
 else if(['json','ndjson'].includes(ext)){
  out.mode='structured';out.original=text();const parsed=ext==='ndjson'?out.original.split(/\r?\n/).filter(l=>l.trim()).map(l=>JSON.parse(l)):JSON.parse(out.original);
  const resources=Array.isArray(parsed)?parsed:parsed.resourceType==='Bundle'?(parsed.entry||[]).map((e:{resource:unknown})=>e.resource):[parsed];
  if(!resources.length||resources.some((r:unknown)=>!r||typeof r!=='object'||!('resourceType' in r)))throw Error('Expected FHIR resources, a Bundle, or NDJSON resources.');
  fhirSegments(parsed,'',out.segments);
 }
 else if(ext==='hl7'){
  out.mode='structured';out.original=text();const rows=out.original.split(/\r\n|\r|\n/).filter(r=>r);if(!rows[0]?.startsWith('MSH'))throw Error('HL7 input must start with MSH.');const separator=rows[0][3]!;let message=0;
  rows.forEach((line,i)=>{const fields=line.split(separator);const type=fields[0]!;if(type==='MSH')message++;fields.slice(1).forEach((value,n)=>{if(value==='')return;const index=type==='MSH'?n+2:n+1;out.segments.push({id:`message-${message}/line-${i+1}/${type}-${index}`,label:`Message ${message} · line ${i+1} · ${type}-${index}`,text:value});});});
  out.warnings.push('Raw HL7 field values and repetitions are preserved. No live feed or terminology mapping is performed.');
 }
 else throw Error('Use text PDF, DOCX, TXT/Markdown, CSV/TSV, XLSX, FHIR JSON/NDJSON or HL7. Scans, images, RTF, XLS and C-CDA are not processed by this reader.');
 if(out.segments.length>12000||out.segments.reduce((n,s)=>n+s.text.length,0)>MAX_TEXT)throw Error('Source is too large for this review. Split into files below 100,000 text characters and 12,000 fields.');
 if(!out.segments.length)throw Error('No readable source content found.');
 if(out.mode==='narrative')out.segments=out.segments.flatMap(s=>splitSegment(s));
 else out.entities=out.segments.map(s=>parserEntity(s,s.label,s.text,s.id));
 if(out.mode==='structured'){try{out.releaseRows=releaseRows(out);}catch(e){out.releaseProblem=e instanceof Error?e.message:String(e);}}
 return out;
}
