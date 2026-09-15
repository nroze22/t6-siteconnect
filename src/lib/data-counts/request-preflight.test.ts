import {describe,it,expect} from 'vitest';
import {checkRequest,parseRequest,REQUEST_TEMPLATE,requestJsonSchema,MAX_REQUEST_BYTES} from './request-preflight';
const draft=()=>structuredClone(REQUEST_TEMPLATE);
describe('request preflight boundary',()=>{
 it('accepts a complete format without granting permission or execution',()=>{
  const result=checkRequest(draft());expect(result.schemaValid).toBe(true);expect(result.executionAllowed).toBe(false);
  expect(result.findings.map(f=>f.code)).toEqual(['authority-unverified','execution-unavailable','draft-request','permissions-unverified']);
 });
 it('does not trust an approved declaration',()=>{const r=draft();r.approval={...r.approval,status:'approved',approvedAt:'2026-01-01T00:00:00Z'};const result=checkRequest(r);expect(result.schemaValid).toBe(true);expect(result.executionAllowed).toBe(false);expect(result.findings.some(f=>f.code==='authority-unverified')).toBe(true);});
 it('requires permission version and rejects unknown instructions',()=>{const r=draft();expect(checkRequest({...r,permissions:{source:'site',rule:'include all'}}).schemaValid).toBe(false);expect(checkRequest({...r,execute:true}).schemaValid).toBe(false);});
 it.each(['2026-02-30','2026-13-01','not-a-date'])('rejects impossible date %s',start=>{const r=draft();r.dateRange.start=start;expect(checkRequest(r).schemaValid).toBe(false);});
 it('rejects reversed dates, duplicate fields and absent approval time',()=>{const r=draft();r.dateRange.end='2026-07-01';r.fields.push(r.fields[0]!);r.approval.status='approved';expect(checkRequest(r).findings.map(f=>f.field)).toEqual(expect.arrayContaining(['fields','dateRange.end','approval.approvedAt']));});
 it('reports unsupported source, domain, field, cohort, schedule, mode and output without substitutions',()=>{const r=draft();r.sourceSystems=['hospital-emr'];r.domains=['radiology'];r.fields=['ImagingStudy.id'];r.mode='incremental';r.cadence.frequency='daily';r.outputSchema='other/1';r.cohort.minimumAge=0;const result=checkRequest(r);expect(result.schemaValid).toBe(true);expect(result.findings.map(f=>f.code)).toEqual(expect.arrayContaining(['unsupported-source','unsupported-domain','unsupported-field','unsupported-cohort','unsupported-schedule','unsupported-refresh','unsupported-output']));expect(result.specification?.fields).toEqual(['ImagingStudy.id']);});
 it('flags request identity changes and preserves the source object',()=>{const r=draft();r.version=4;const before=JSON.stringify(r);expect(checkRequest(r).findings.some(f=>f.code==='different-request')).toBe(true);expect(JSON.stringify(r)).toBe(before);});
 it('bounds size and reports invalid JSON',()=>{expect(()=>parseRequest('x'.repeat(MAX_REQUEST_BYTES+1))).toThrow('too large');expect(()=>parseRequest('{broken')).toThrow('not valid JSON');expect(checkRequest(null).schemaValid).toBe(false);});
 it('exports a closed machine-readable schema',()=>{expect(requestJsonSchema()).toMatchObject({type:'object',additionalProperties:false});});
});
