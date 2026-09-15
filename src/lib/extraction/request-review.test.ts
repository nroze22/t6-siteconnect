import {it,expect} from 'vitest';
import {fixture} from '@/lib/data-counts/engine';
import {requestFindings,correctAnnotation,concern} from './request-review';
import {validateEntities} from './review';
import type {SourceFile} from './types';
const source:SourceFile={name:'synthetic.txt',hash:'hash',format:'txt',segments:[{id:'s1',label:'Paragraph 1',text:'Creatinine was 1.36 mg/dL.'}],entities:[],warnings:[],mode:'narrative',original:'Creatinine was 1.36 mg/dL.'};
const candidate={field:'Observation.valueQuantity',segment_id:'s1',kind:'lab',label:'Creatinine',value:'1.36',unit:'mg/dL',subject:null,assertion:'present',quote:'Creatinine was 1.36 mg/dL.'};
const entity=validateEntities({entities:[candidate]},source.segments)[0]!;
it('does not turn unprocessed or generic extraction into not-found findings',()=>{
 expect(requestFindings(source,[],false,[],true).every(f=>f.state==='Not assessed')).toBe(true);
 expect(requestFindings(source,[entity],true,[],false).every(f=>f.state==='Not assessed')).toBe(true);
});
it('distinguishes found evidence from omission and rejection without claiming eligibility',()=>{
 const f=requestFindings(source,[entity],true,[],true);expect(f.find(v=>v.field===candidate.field)?.state).toBe('Evidence found');
 expect(f.find(v=>v.field==='Patient.birthDate')?.state).toBe('Not found');
 expect(requestFindings(source,[entity],true,[entity.id],true).find(v=>v.field===candidate.field)?.state).toBe('Not found');
 expect(f.find(v=>v.field===candidate.field)?.detail).toContain('eligibility are not established');
});
it('marks missing units and uncertain assertions for review',()=>{
 expect(concern({...entity,unit:null})).toBe('Missing source unit');
 expect(requestFindings(source,[{...entity,unit:null}],true,[],true).find(v=>v.field===candidate.field)?.state).toBe('Uncertain');
});
it('requires source-grounded corrections and reasons while preserving original output',()=>{
 const bad={...entity,value:'136',supported:false};
 const edit={label:entity.label,value:'1.36',unit:'mg/dL',subject:null,assertion:'present',quote:entity.quote,field:entity.field};
 expect(()=>correctAnnotation(bad,edit,'',source)).toThrow();
 expect(()=>correctAnnotation(bad,{...edit,value:'9.9'},'Reviewed original',source)).toThrow();
 expect(correctAnnotation(bad,edit,'Decimal copied from source',source).supported).toBe(true);expect(bad.value).toBe('136');
});
it('keeps canonical structured completeness and eligibility separate',()=>{
 const f=requestFindings({...source,mode:'structured',releaseRows:fixture(true)},[],true,[],false);
 expect(f.find(v=>v.field==='Observation.valueQuantity')?.detail).toContain('144 of 144');
 expect(f.find(v=>v.field==='Observation.dataAbsentReason')?.state).toBe('Not applicable');
 expect(f.find(v=>v.field==='Patient.birthDate')?.state).toBe('Uncertain');
});
it('rejects invented request fields and mismatched field categories',()=>{
 expect(()=>validateEntities({entities:[{...candidate,field:'invented'}]},source.segments)).toThrow();
 expect(validateEntities({entities:[{...candidate,field:'Observation.code'}]},source.segments)[0]?.supported).toBe(false);
});
