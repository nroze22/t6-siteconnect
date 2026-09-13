import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {releaseRows} from './release';
import type {SourceFile} from './types';
const original=readFileSync('sample-data/extraction/laboratory-source.fhir.json','utf8');
function input(change:(r:any)=>void):SourceFile{const b=JSON.parse(original);const r=b.entry.find((e:any)=>e.resource.resourceType==='Observation').resource;change(r);return {format:'json',original:JSON.stringify(b)} as SourceFile;}
it.each(['component','interpretation','extension','identifier'])('blocks lossy release of %s while keeping input unchanged',key=>{const s=input(r=>{r[key]=[{text:'source-specific context'}];});const before=s.original;expect(()=>releaseRows(s)).toThrow('cannot preserve');expect(s.original).toBe(before);});
it('does not replace a UCUM machine code with a display label',()=>{expect(()=>releaseRows(input(r=>{r.valueQuantity.code='mg/dL';r.valueQuantity.unit='milligrams per deciliter';}))).toThrow('machine code differs');});
it('does not discard permission metadata',()=>{expect(()=>releaseRows(input(r=>{r.meta.security=[{code:'restricted'}];}))).toThrow('provenance/security');});
