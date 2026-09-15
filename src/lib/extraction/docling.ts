import {z} from 'zod';
import {readSource} from './readers';
import {splitSegment} from './review';
import type {SourceFile,Segment} from './types';
const Box=z.object({x:z.number().finite().nonnegative(),y:z.number().finite().nonnegative(),width:z.number().finite().nonnegative(),height:z.number().finite().nonnegative()});
const Result=z.object({profile:z.literal('docling-pdf/1'),version:z.string(),sha256:z.string(),elapsedSeconds:z.number(),pageCount:z.number().int().min(1).max(30),coordinatePrecision:z.string(),settings:z.object({ocr:z.string()}),tables:z.array(z.unknown()),warnings:z.array(z.string()),segments:z.array(z.object({sourceRef:z.string().optional(),id:z.string(),label:z.string(),text:z.string(),page:z.number().int().min(1).max(30),pageWidth:z.number().positive(),pageHeight:z.number().positive(),runs:z.array(z.object({start:z.number().int().nonnegative(),end:z.number().int().nonnegative(),box:Box}))})).min(1).max(12000)});
// Agreement is a coverage signal, never a clinical accuracy score. Keep decimal and comparator spelling.
const numbers=(text:string)=>new Set(text.match(/(?:[<>]=?\s*)?\d+(?:\.\d+)?/g)?.map(v=>v.replace(/\s/g,''))||[]);
export function mergeDocling(raw:unknown,basic:SourceFile):SourceFile{
 const result=Result.parse(raw);
 if(result.sha256!==basic.hash)throw Error('Document reader result belongs to a different source file.');
 const pages=new Map(basic.segments.map(s=>[s.page,s]));
 if(result.pageCount!==pages.size)throw Error('Document readers disagree on page count. Review the original file.');
 if(new Set(result.segments.map(s=>s.id)).size!==result.segments.length||result.segments.reduce((n,s)=>n+s.text.length,0)>100000)throw Error('Invalid or oversized document reading.');
 const warnings=[...result.warnings];let compared=0,disagreements=0;
 const segments:Segment[]=result.segments.flatMap(s=>{
  const page=pages.get(s.page);if(!page?.image)throw Error('Document reader returned an unknown source page.');
  if(Math.abs(s.pageWidth-(page.pageWidth||0))>2||Math.abs(s.pageHeight-(page.pageHeight||0))>2)throw Error('Document readers disagree on page orientation or size. Original coordinates require review.');
  if(s.runs.some(r=>r.end>s.text.length||r.end<r.start||r.box.x+r.box.width>s.pageWidth+2||r.box.y+r.box.height>s.pageHeight+2))throw Error('Invalid document source coordinates.');
  return splitSegment({...s,image:page.image});
 });
 for(const page of pages.keys()){
  // Native PDF text may be empty on scans; do not claim independent confirmation there.
  const text=basic.segments.filter(s=>s.page===page).map(s=>s.text).join('');
  if(!text.trim())continue;
  compared++;
  const parsed=result.segments.filter(s=>s.page===page).map(s=>s.text).join(' '),a=numbers(text),b=numbers(parsed);
  if([...a].some(n=>!b.has(n))||[...b].some(n=>!a.has(n))){disagreements++;warnings.push(`Page ${page}: readers disagree on numeric tokens. Coverage is incomplete until the original document is reviewed through a corrected source.`);}
 }
 const verification=disagreements?`${disagreements} page(s) need numeric-source reconciliation`:compared?`Numeric token sets agree on ${compared} text-bearing page(s); row association and clinical meaning still require review`:'Scan only: no independent text layer; OCR requires visual review';
 return {...basic,segments,entities:[],warnings,original:basic.original,documentReader:{engine:'Docling',ocr:result.settings.ocr,version:result.version,elapsedSeconds:result.elapsedSeconds,tables:result.tables,verification,coordinatePrecision:result.coordinatePrecision}};
}
export async function readWithDocling(file:File):Promise<SourceFile>{
 const basic=await readSource(file,{allowImagePages:true});
 const {invoke}=await import('@tauri-apps/api/core');
 const raw=await invoke('parse_docling_pdf',{bytes:Array.from(new Uint8Array(await file.arrayBuffer()))});
 return mergeDocling(raw,basic);
}
