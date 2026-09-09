import {REQUEST} from '@/lib/data-counts/engine';
import type {Entity,SourceFile} from './types';
import {validateEntities} from './review';
export const REQUEST_KEY=`${REQUEST.id}@${REQUEST.version}`;
export const FIELDS=[...REQUEST.fields,'Patient.id','Patient.birthDate'];
export const FIELD_LABELS:Record<string,string>={'Observation.id':'Source observation ID','Observation.code':'Source test code','Observation.valueQuantity':'Result and source unit','Observation.effectiveDateTime':'Observation / collection time','Observation.issued':'Result available time','Observation.status':'Result status','Observation.specimen':'Specimen','Observation.dataAbsentReason':'Missing-result reason','Observation.referenceRange':'Source reference interval','Patient.id':'Patient identity','Patient.birthDate':'Birth date / adult eligibility'};
export type Finding={field:string;label:string;state:'Not assessed'|'Not found'|'Uncertain'|'Evidence found'|'Not applicable';detail:string;entityIds:string[]};
export type AnnotationChange={entityId:string;action:'correct'|'reject'|'reopen';reason:string;at:string;sourceHash:string;before:Entity;after?:Entity};
export type ExceptionNote={field:string;state:'Not found'|'Uncertain'|'Not applicable'|'Resolved';reason:string;at:string;sourceHash:string};
export function concern(e:Entity):string{
 if(!e.supported)return 'Source mismatch';
 if(e.kind==='lab'&&!e.unit)return 'Missing source unit';
 if(e.assertion==='uncertain'||e.assertion==='unknown')return 'Uncertain context';
 if(e.assertion==='historical')return 'Historical / superseded context';
 if(e.kind==='lab'&&!e.subject)return 'Patient association to review';
 return 'Ready for review';
}
export function correctAnnotation(before:Entity,edit:Pick<Entity,'label'|'value'|'unit'|'subject'|'assertion'|'quote'|'field'>,reason:string,source:SourceFile):Entity{
 if(before.origin==='parser')throw Error('Original parsed records cannot be edited through annotation review.');
 if(reason.trim().length<5)throw Error('Record a specific reason for the correction.');
 const candidate={segment_id:before.segment_id,kind:edit.field?(edit.field==='Observation.valueQuantity'?'lab':'context'):before.kind,...edit};
 const next=validateEntities({entities:[candidate]},source.segments)[0]!;
 if(!next.supported)throw Error(next.problem||'Correction must be supported by this source segment.');
 return {...next,id:before.id,origin:before.origin};
}
export function requestFindings(source:SourceFile,entities:Entity[],complete:boolean,rejected:string[],scoped:boolean):Finding[]{
 const rows=source.releaseRows;
 return FIELDS.map(field=>{
  const selected=entities.filter(e=>e.field===field&&!rejected.includes(e.id));
  const finding:Finding={field,label:FIELD_LABELS[field]!,state:'Not assessed',detail:'Run request-focused extraction. Absence has not been checked.',entityIds:selected.map(e=>e.id)};
  if(rows){
   const keys:Record<string,string>={'Observation.id':'id','Observation.code':'code','Observation.valueQuantity':'value','Observation.effectiveDateTime':'effectiveDateTime','Observation.issued':'issued','Observation.status':'status','Observation.specimen':'specimen','Observation.dataAbsentReason':'dataAbsentReason','Observation.referenceRange':'referenceRange','Patient.id':'patient'};
   const key=keys[field];
   if(!key)return {...finding,state:'Uncertain',detail:'This source checklist does not establish adult eligibility. Review the cohort and authority checks in the laboratory workflow.'};
   const count=rows.filter(row=>{const v=(row as unknown as Record<string,unknown>)[key];return v!==undefined&&v!==null&&v!==''&&(field!=='Observation.valueQuantity'||!!row.unit);}).length;
   if(field==='Observation.dataAbsentReason'&&rows.every(r=>r.value!==null&&r.status!=='cancelled'))return {...finding,state:'Not applicable',detail:'All parsed observations contain a result and none is cancelled. This applies only to this file.'};
   return {...finding,state:count===rows.length?'Evidence found':count?'Uncertain':'Not found',detail:`${count} of ${rows.length} source observations supply this field${field==='Observation.valueQuantity'?' with a unit':''}. Full source quality and release checks still apply.`};
  }
  if(source.mode==='structured')return {...finding,detail:'This structured format has no supported laboratory mapping. Inspect its raw fields; no request completeness is inferred.'};
  if(!complete||!scoped)return finding;
  if(!selected.length)return {...finding,state:'Not found',detail:'No candidate was returned or retained for this field. This may be a model omission; inspect the source before recording a gap.'};
  const uncertain=selected.some(e=>/^(not supplied|not available|unknown|absent|not documented|none)$/i.test(e.value.trim())||!e.supported||e.assertion!=='present'||(e.kind==='lab'&&!e.unit));
  return {...finding,state:uncertain?'Uncertain':'Evidence found',detail:`${selected.length} candidate(s). Evidence is document-level; observation linkage, date-window inclusion and cohort eligibility are not established.`};
 });
}
