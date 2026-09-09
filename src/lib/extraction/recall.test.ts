import {describe,it,expect} from 'vitest';
import {directCandidates,mergeCandidates,uncoveredMeasurements} from './recall';
import {NOTE} from '../data-counts/engine';
const segment=(text:string)=>({id:'s1',label:'Note',text});
describe('source recall rules',()=>{
 it('recovers both sample-note labs with exact offsets, without inventing context',()=>{const s=segment(NOTE);const e=directCandidates([s]);expect(e.filter(x=>x.kind==='lab').map(x=>[x.label,x.value,x.unit])).toEqual([['creatinine','1.36','mg/dL'],['potassium','4.44','mmol/L']]);for(const x of e){expect(s.text.slice(x.start,x.end)).toBe(x.quote);expect(x.origin).toBe('rule');expect(x.assertion).toBe('unknown');expect(x.subject).toBeNull();}expect(uncoveredMeasurements([s],e)).toEqual([]);});
 it('preserves comparators and repeated occurrences',()=>{const s=segment('Potassium <2.5 mmol/L. Potassium <2.5 mmol/L.');const e=directCandidates([s]);expect(e).toHaveLength(2);expect(e[0]!.value).toBe('<2.5');expect(e[0]!.start).not.toBe(e[1]!.start);});
 it('never labels a historical or negated mention as present',()=>{for(const text of ['Previous creatinine 1.3 mg/dL.','Not creatinine 1.3 mg/dL; transcription error.'])expect(directCandidates([segment(text)])[0]!.assertion).toBe('unknown');});
 it('retains blank table units and arbitrary analytes',()=>{const s=segment('Table headers: Test | Result | Unit | Status\nUncommon analyte | 4.2 | | final');expect(directCandidates([s])[0]).toMatchObject({label:'Uncommon analyte',value:'4.2',unit:null});});
 it('recovers labeled request metadata and avoids unrelated medication',()=>{const s=segment('Patient ID SYN-003. Observation ID OBS-003-1. Test code 2160-0. Creatinine 1.36 mg/dL. Specimen Serum. Observation time 2026-08-06T08:30:00Z. Issued 2026-08-06T10:15:00Z. Result status final. Birth date 1970-04-12. Metformin 500 mg daily.');expect(directCandidates([s])).toHaveLength(9);});
 it('deduplicates matching supported model facts but retains unsupported misses and separate occurrences',()=>{const r=directCandidates([segment('Sodium 140 mmol/L. Sodium 140 mmol/L.')]);const model={...r[0]!,id:'model1',origin:'model' as const,assertion:'present'};expect(mergeCandidates(r,[model])).toHaveLength(2);expect(mergeCandidates(r,[{...model,supported:false}])).toHaveLength(3);});
 it('flags unknown measurement names instead of claiming completeness',()=>{const s=segment('Mystery analyte 17.4 mg/dL.');expect(directCandidates([s])).toEqual([]);expect(uncoveredMeasurements([s],[])).toHaveLength(1);});
});
