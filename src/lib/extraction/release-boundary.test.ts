import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {sourceObservation,buildRun} from '@/lib/data-counts/engine';
import {releaseRows} from './release';
import type {SourceFile} from './types';
const original=readFileSync('sample-data/extraction/laboratory-source.fhir.json','utf8');
function input(change:(r:any)=>void):SourceFile{const b=JSON.parse(original);const r=b.entry.find((e:any)=>e.resource.resourceType==='Observation').resource;change(r);return {format:'json',original:JSON.stringify(b)} as SourceFile;}
it.each(['component','interpretation','extension','identifier'])('blocks lossy release of %s while keeping input unchanged',key=>{const s=input(r=>{r[key]=[{text:'source-specific context'}];});const before=s.original;expect(()=>releaseRows(s)).toThrow('cannot preserve');expect(s.original).toBe(before);});
it('preserves distinct machine units and supplied terminology through release preparation',async()=>{
 const source=input(r=>{r.valueQuantity.code='mg/dL';r.valueQuantity.unit='milligrams per deciliter';r.code.coding[0].version='2.80';r.code.coding[0].userSelected=false;r.code.text='Source laboratory test';});
 const rows=releaseRows(source);const r=rows[0]!;expect(r.quantityCode).toBe('mg/dL');expect(r.unit).toBe('milligrams per deciliter');
 const projected=sourceObservation(r);expect(projected).toHaveProperty('valueQuantity.code','mg/dL');expect(projected.code.text).toBe('Source laboratory test');expect(projected.code.coding[0]?.userSelected).toBe(false);
 const run=await buildRun(true,false,rows);expect(run.output[0]).toMatchObject({quantityCode:'mg/dL',codingVersion:'2.80',codingText:'Source laboratory test',codingUserSelected:false});
});
it('retains supplied reference interval context without inventing guidance',()=>{
 const rows=releaseRows(input(r=>{r.referenceRange=[{low:{value:0.6,unit:'mg/dL',system:'http://unitsofmeasure.org',code:'mg/dL'},high:{value:1.2,unit:'mg/dL'},text:'Adult source interval'}];}));
 expect(sourceObservation(rows[0]!).referenceRange?.[0]).toEqual({low:{value:0.6,unit:'mg/dL',system:'http://unitsofmeasure.org',code:'mg/dL'},high:{value:1.2,unit:'mg/dL'},text:'Adult source interval'});
});
it.each([
 ['encounter',(r:any)=>{r.encounter={reference:'Encounter/1'};}],
 ['subject identifier',(r:any)=>{r.subject.identifier={value:'patient-alias'};}],
 ['quantity extension',(r:any)=>{r.valueQuantity.extension=[{url:'source'}];}],
 ['permission metadata',(r:any)=>{r.meta.security=[{code:'restricted'}];}],
 ['absent reason system',(r:any)=>{delete r.valueQuantity;r.dataAbsentReason={coding:[{system:'urn:local',code:'error'}]};}],
 ['conflicting value',(r:any)=>{r.dataAbsentReason={coding:[{system:'http://terminology.hl7.org/CodeSystem/data-absent-reason',code:'error'}]};}],
])('does not silently discard %s',(_label,change)=>{const source=input(change);const original=source.original;expect(()=>releaseRows(source)).toThrow('Release profile');expect(source.original).toBe(original);});
it('rejects resources outside the accepted extract rather than silently skipping them',()=>{
 const b=JSON.parse(original);b.entry.push({resource:{resourceType:'DiagnosticReport',id:'report'}});expect(()=>releaseRows({format:'json',original:JSON.stringify(b)} as SourceFile)).toThrow('Release profile');
});

it('keeps blank tabular results missing and rejects unknown columns',()=>{
 const row=releaseRows(input(()=>{}))[0]!;const make=(extra:Record<string,string>)=>({name:'test.csv',hash:'fixture',entities:[],mode:'structured',original:'',format:'csv',warnings:[],segments:Object.entries({...row,value:'',dataAbsentReason:'not-performed',...extra}).map(([key,value])=>({id:key,label:`Sheet 1 · Row 2 · ${key}`,text:String(value)}))}) as SourceFile;
 const missing=releaseRows(make({}))[0]!;expect(missing.value).toBeNull();expect(missing.dataAbsentReason).toBe('not-performed');
 expect(()=>releaseRows(make({interpretation:'critical'}))).toThrow();
});

it('does not invent a missing machine code from the unit display label',()=>{
 const r=releaseRows(input(r=>{delete r.valueQuantity.code;}))[0]!;
 expect(r.quantityCode).toBeUndefined();expect(sourceObservation(r)).not.toHaveProperty('valueQuantity.code');
});
