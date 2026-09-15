import {describe,it,expect} from 'vitest';
import {mergeDocling} from './docling';
import type {SourceFile} from './types';
const base:SourceFile={name:'synthetic.pdf',hash:'abc',format:'pdf',segments:[{id:'page-1',label:'PDF page 1',text:'Glucose 112',page:1,pageWidth:600,pageHeight:800,image:'data:image/png;base64,AA=='}],entities:[],warnings:[],mode:'narrative',original:''};
function reading(text='Glucose 112'){return {profile:'docling-pdf/1',version:'test',sha256:'abc',elapsedSeconds:1,pageCount:1,coordinatePrecision:'block',settings:{ocr:'Test OCR'},tables:[],warnings:[],segments:[{id:'block-1',label:'PDF page 1 · text',text,page:1,pageWidth:600,pageHeight:800,runs:[{start:0,end:text.length,box:{x:10,y:20,width:100,height:30}}]}]};}
describe('Docling source trust boundary',()=>{
 it('retains original rendering and block coordinates with independent token agreement',()=>{const doc=mergeDocling(reading(),base);expect(doc.segments[0]?.image).toBe(base.segments[0]?.image);expect(doc.documentReader?.verification).toContain('agree on 1');expect(doc.segments[0]?.runs?.[0]?.box.y).toBe(20);});
 it('flags changed or missing numbers without replacing source values',()=>{const doc=mergeDocling(reading('Glucose 121'),base);expect(doc.warnings.join(' ')).toContain('Coverage is incomplete');expect(base.segments[0]?.text).toBe('Glucose 112');});
 it('never describes scan OCR as independently verified',()=>{const doc=mergeDocling(reading(),{...base,segments:[{...base.segments[0]!,text:''}]});expect(doc.documentReader?.verification).toContain('no independent text layer');});
 it('rejects the wrong file, unknown page and coordinates outside a page',()=>{expect(()=>mergeDocling({...reading(),sha256:'other'},base)).toThrow();const r=reading();r.segments[0]!.page=2;expect(()=>mergeDocling(r,base)).toThrow();const b=reading();b.segments[0]!.runs[0]!.box.x=700;expect(()=>mergeDocling(b,base)).toThrow();});
 it('retains incomplete coverage warnings and never grants laboratory import',()=>{const doc=mergeDocling({...reading(),warnings:['Page 2 omitted. Coverage is incomplete.']},base);expect(doc.warnings).toHaveLength(1);expect(doc.releaseRows).toBeUndefined();});
});

// Captured from the real pinned Docling worker on the accompanying synthetic PDF.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
it('accepts real worker provenance and preserves the empty unit column',()=>{
 const raw=JSON.parse(readFileSync('sample-data/docling/expected-layout.json','utf8'));
 const hash=createHash('sha256').update(readFileSync('sample-data/docling/lab-table.pdf')).digest('hex');
 const page={...base.segments[0]!,pageWidth:612,pageHeight:792,text:raw.segments.map((s:{text:string})=>s.text).join('\n')};
 const doc=mergeDocling(raw,{...base,hash,segments:[page]});
 expect(doc.segments.find(s=>s.text.includes('Glucose | 112'))?.text).toContain('Glucose | 112 |  | Not supplied');
 expect(doc.segments.every(s=>s.sourceRef&&s.image)).toBe(true);
 expect(doc.documentReader?.ocr).toBe('Tesseract English');
});
