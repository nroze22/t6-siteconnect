import {describe,it,expect} from 'vitest';
import {fixture,comparePackages,displayResult,eligible,inRequestWindow,sourceBundle,sourceObservation,quality,buildRun,authorize,send} from './engine';
describe('Data COUNTS synthetic rehearsal',()=>{
 it('exports FHIR-shaped source evidence with preserved codes, values and subject links',()=>{const l=fixture(true)[0]!;const source=sourceObservation(l);expect(('valueQuantity' in source?source.valueQuantity.value:undefined)).toBe(l.value);expect(source.code.coding[0]!.code).toBe(l.code);expect(source.subject.reference).toBe('Patient/SYN-001');expect(sourceBundle(true).entry).toHaveLength(156);});
 it('reports both seeded defects and blocks output',async()=>{const r=await buildRun(false,false);expect(quality(fixture())).toHaveLength(2);expect(r.output).toHaveLength(0);expect(()=>authorize(r,false,false)).toThrow();});
 it('preserves codes and units, reconciles disjoint exclusions, and shifts temporal intervals',async()=>{const r=await buildRun(true,false);expect(r.sourceCount).toBe(144);expect(r.output).toHaveLength(120);expect(r.cohortExcluded).toBe(12);expect(r.permissionExcluded).toBe(12);const source=fixture(true)[0]!;const out=r.output[0]!;expect(out.code).toBe(source.code);expect(out.unit).toBe(source.unit);expect(Date.parse(out.issued)-Date.parse(out.effectiveDateTime)).toBe(Date.parse(source.issued)-Date.parse(source.effectiveDateTime));expect(out).not.toHaveProperty('patient');});
 it('reproduces package identity and logical output',async()=>{expect(await buildRun(true,false)).toEqual(await buildRun(true,false));});
 it('invalidates approval when permissions change and excludes subsequent rows',async()=>{const r=await buildRun(true,false);expect(()=>send(r,r.digest,true,true,[])).toThrow('Inputs changed');const next=await buildRun(true,true);expect(next.output).toHaveLength(108);expect(next.output.some(l=>l.patientToken==='DEMO-TOKEN-003')).toBe(false);expect(next.digest).not.toBe(r.digest);});
 it('prevents unapproved send and duplicate ingestion after timeout',async()=>{const r=await buildRun(true,false);expect(()=>send(r,null,true,false,[])).toThrow();const receipts=send(r,r.digest,true,false,[]);expect(send(r,r.digest,true,false,receipts)).toHaveLength(1);expect(receipts[0]!.status).toBe('awaiting');});
});

describe('Clinical data fidelity and cohort boundaries',()=>{
 it('uses whole blood for hemoglobin and serum for chemistry while preserving final status',()=>{
  const labs=fixture(true);expect(labs.filter(l=>l.code==='718-7').every(l=>l.specimen==='Whole blood')).toBe(true);
  expect(labs.filter(l=>l.code!=='718-7').every(l=>l.specimen==='Serum')).toBe(true);
  expect(sourceObservation(labs[0]!).specimen.display).toBe('Serum');
  expect(sourceObservation(labs[0]!)).not.toHaveProperty('referenceRange');
 });
 it('applies the request window to source time before date shifting',async()=>{
  const labs=fixture(true);labs[0]!.effectiveDateTime='2026-07-31T23:59:59Z';labs[0]!.issued='2026-08-01T00:10:00Z';
  const r=await buildRun(true,false,labs);expect(r.issues).toHaveLength(0);expect(r.output).toHaveLength(119);expect(r.cohortExcluded).toBe(13);
  expect(r.exclusions).toContainEqual({patient:'SYN-001',count:1,reason:'Outside requested UTC window'});
 });
 it('rejects invalid calendar timestamps, missing timezone and unknown patient references',()=>{
  const labs=fixture(true);labs[0]!.effectiveDateTime='2026-02-30T08:30:00Z';labs[1]!.issued='2026-08-06T10:15:00';labs[2]!.patient='UNKNOWN';
  const issues=quality(labs);expect(issues.some(i=>i.id===`date-${labs[0]!.id}`)).toBe(true);expect(issues.some(i=>i.id===`date-${labs[1]!.id}`)).toBe(true);expect(issues.some(i=>i.id===`patient-${labs[2]!.id}`)).toBe(true);
 });
 it('blocks missing observations rather than silently presenting a complete extract',()=>{
  const labs=fixture(true);labs.pop();expect(quality(labs).some(i=>i.id==='count-SYN-012')).toBe(true);
 });
 it('exposes disjoint permission reasons and changes identity on clinical source changes',async()=>{
  const r=await buildRun(true,true);expect(r.exclusions).toContainEqual({patient:'SYN-003',count:12,reason:'Permission revoked in fixture v2'});
  const labs=fixture(true);labs[0]!.value=1.1;expect((await buildRun(true,false,labs)).digest).not.toBe((await buildRun(true,false)).digest);
 });
});

it('uses the exact adult cutoff and timezone-aware source window boundaries',()=>{
 expect(eligible({id:'edge',birthDate:'2008-08-01',permitted:true})).toBe(true);
 expect(eligible({id:'edge',birthDate:'2008-08-02',permitted:true})).toBe(false);
 expect(eligible({id:'edge',birthDate:'2000-02-30',permitted:true})).toBe(false);
 const l=fixture(true)[0]!;
 expect(inRequestWindow({...l,effectiveDateTime:'2026-08-01T00:00:00Z'})).toBe(true);
 expect(inRequestWindow({...l,effectiveDateTime:'2026-08-01T00:00:00+01:00'})).toBe(false);
 expect(inRequestWindow({...l,effectiveDateTime:'2026-09-01T00:30:00+01:00'})).toBe(true);
 expect(inRequestWindow({...l,effectiveDateTime:'2026-09-01T00:00:00Z'})).toBe(false);
});

it('preserves lifecycle semantics and compares five changes after release',async()=>{
 const previous=await buildRun(true,false);const next=await buildRun(true,false,undefined,true);
 expect(next.issues).toHaveLength(0);expect(next.output).toHaveLength(120);
 const diff=comparePackages(previous.output,next.output);expect(diff.changed).toHaveLength(5);expect(diff.changed.find(c=>c.id==='OBS-003-1-3')?.fields).toContain('Reference interval');expect(diff.added).toHaveLength(0);expect(diff.removed).toHaveLength(0);
 const labs=fixture(true,true);const cancelled=sourceObservation(labs[25]!);expect(cancelled).not.toHaveProperty('valueQuantity');expect(cancelled).toHaveProperty('dataAbsentReason');
 expect(displayResult(labs[27]!)).toBe('<2.5 mmol/L');expect(sourceObservation(labs[26]!)).toHaveProperty('referenceRange');
 expect(()=>send(previous,previous.digest,true,false,[],true)).toThrow('Inputs changed');
});
it('rejects measured values on cancelled observations and conflicting absent reasons',()=>{
 const labs=fixture(true,true);labs[25]!.value=19;expect(quality(labs).some(i=>i.id==='type-OBS-003-1-2')).toBe(true);
});

it('blocks reversed source intervals and comparators without a value',()=>{const labs=fixture(true,true);labs[26]!.referenceRange={low:145,high:135,unit:'mmol/L'};labs[25]!.comparator='<';expect(quality(labs).filter(i=>i.id.startsWith('context-'))).toHaveLength(2);});
