import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readSource,parseDelimited,cellsFromRows} from './readers';
import {validateEntities,splitSegment,chunks} from './review';
import {buildRun} from '@/lib/data-counts/engine';
function file(name:string){const data=readFileSync(`sample-data/extraction/${name}`);return {name,size:data.length,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)} as File;}
describe('source format fidelity',()=>{
 it('preserves quoted delimiters, newlines and empty cells',()=>{expect(parseDelimited('a,b\r\n"x,y","line1\nline2"\r\n,2')).toEqual([['a','b'],['x,y','line1\nline2'],['','2']]);expect(()=>parseDelimited('a\n"broken')).toThrow();expect(()=>cellsFromRows([['a','b'],['1']])).toThrow();});
 for(const name of ['laboratory-source.csv','laboratory-source.tsv','laboratory-source.xlsx','laboratory-source.fhir.json','laboratory-source.ndjson'])it(`retains a complete lab source from ${name}`,async()=>{const source=await readSource(file(name));expect(source.mode).toBe('structured');expect(source.releaseProblem).toBeUndefined();expect(source.releaseRows).toHaveLength(144);expect(source.entities.every(e=>e.supported)).toBe(true);const run=await buildRun(true,false,source.releaseRows,false,{hash:source.hash,name:source.name});expect(run.issues).toEqual([]);expect(run.output).toHaveLength(120);});
 it('retains HL7 field locations without interpreting their codes',async()=>{const source=await readSource(file('synthetic-lab.hl7'));expect(source.segments.find(s=>s.label.endsWith('OBX-5'))?.text).toBe('1.36');expect(source.releaseRows).toBeUndefined();});
 it('retains DOCX paragraphs and text file paragraphs',async()=>{const doc=await readSource(file('synthetic-clinical-report.docx'));expect(doc.segments).toHaveLength(7);expect(doc.segments[0]!.label).toBe('Word paragraph 1');const text=await readSource(file('two-patients.txt'));expect(text.segments).toHaveLength(2);});
 it('binds excluded source content via the file hash',async()=>{const source=await readSource(file('laboratory-source.csv'));const a=await buildRun(true,false,source.releaseRows,false,{hash:'a',name:'source.csv'});const b=await buildRun(true,false,source.releaseRows,false,{hash:'b',name:'source.csv'});expect(a.output).toEqual(b.output);expect(a.digest).not.toBe(b.digest);});
});
describe('source anchors and model validation',()=>{
 const e={segment_id:'p1',kind:'lab',label:'Potassium',value:'4.4',unit:'mmol/L',subject:null,assertion:'present',quote:'Potassium was 4.4 mmol/L'};
 it('locates an exact unique quote and rejects unsupported fields',()=>{const segments=[{id:'p1',label:'Page 1',text:'Yesterday: Potassium was 4.4 mmol/L.'}];expect(validateEntities({entities:[e]},segments)[0]).toMatchObject({supported:true,start:11});expect(validateEntities({entities:[{...e,value:'5.0'}]},segments)[0]!.supported).toBe(false);});
 it('blocks uncertainty stored as a diagnosis value and empty nullable fields',()=>{const text='Possible pneumonia is under evaluation';const raw={...e,kind:'diagnosis',label:'pneumonia',value:'Possible',unit:null,assertion:'uncertain',quote:text};expect(validateEntities({entities:[raw]},[{id:'p1',label:'P1',text}])[0]!.supported).toBe(false);expect(validateEntities({entities:[{...e,unit:''}]},[{id:'p1',label:'P1',text:e.quote}])[0]!.supported).toBe(false);});
 it('does not attach an ambiguous duplicate quote to the first occurrence',()=>{expect(validateEntities({entities:[e]},[{id:'p1',label:'P1',text:e.quote+' and '+e.quote}])[0]!.supported).toBe(false);});
 it('rejects invented schema fields and missing fields',()=>{expect(()=>validateEntities({entities:[{...e,confidence:.99}]},[])).toThrow();expect(()=>validateEntities({entities:[{label:'x'}]},[])).toThrow();});
 it('splits long text without losing characters or page anchors',()=>{const text=('word '.repeat(1800));const parts=splitSegment({id:'p1',label:'Page 1',page:1,text});expect(parts.map(p=>p.text).join('')).toBe(text);expect(parts.every(p=>p.page===1)).toBe(true);expect(chunks(parts).length).toBeGreaterThan(1);});
});
