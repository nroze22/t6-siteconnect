import {z} from 'zod';
import {PATIENTS,type Lab} from '@/lib/data-counts/engine';
import type {SourceFile} from './types';
export const LabInput=z.object({resourceType:z.literal('Observation'),id:z.string().min(1),patient:z.string().min(1),status:z.enum(['final','corrected','cancelled']),specimen:z.enum(['Serum','Whole blood']),code:z.string(),display:z.string(),system:z.string(),value:z.number().finite().nullable(),comparator:z.literal('<').optional(),dataAbsentReason:z.string().optional(),referenceRange:z.object({low:z.number(),high:z.number(),unit:z.string()}).optional(),unit:z.string(),unitSystem:z.string(),effectiveDateTime:z.string(),issued:z.string(),sourceVersion:z.string().min(1)});
export function releaseRows(source:SourceFile):Lab[]{
 const labs:unknown[]=[];
 if(['json','ndjson'].includes(source.format)){
  const parsed=source.format==='ndjson'?source.original.split(/\r?\n/).filter(l=>l.trim()).map(l=>JSON.parse(l)):JSON.parse(source.original);
  const resources=Array.isArray(parsed)?parsed:parsed.resourceType==='Bundle'?parsed.entry.map((e:{resource:unknown})=>e.resource):[parsed];
  for(const r of resources){if(r.resourceType==='Patient'){const expected=PATIENTS.find(p=>p.id===r.id);if(!expected||expected.birthDate!==r.birthDate)throw Error('Patient demographics do not match this synthetic request authority.');}
   if(r.resourceType!=='Observation')continue;
   if(r.code?.coding?.length!==1)throw Error('This laboratory profile requires one unambiguous supplied test coding.');const code=r.code.coding[0];const q=r.valueQuantity;
   if(r.referenceRange?.length>1)throw Error('Multiple reference intervals require a broader request profile.');const range=r.referenceRange?.[0];if(range?.high?.unit&&range.high.unit!==range.low?.unit)throw Error('Reference interval units disagree. Resolve the source before release.');
   labs.push({resourceType:'Observation',id:r.id,patient:r.subject?.reference?.replace(/^Patient\//,''),status:r.status,specimen:r.specimen?.display,code:code.code,display:code.display,system:code.system,value:q?.value??null,...(q?.comparator?{comparator:q.comparator}:{}),...(r.dataAbsentReason?{dataAbsentReason:r.dataAbsentReason.coding?.[0]?.code}:{}),...(range?{referenceRange:{low:range.low?.value,high:range.high?.value,unit:range.low?.unit}}:{}),unit:q?.unit??'',unitSystem:q?.system??'',effectiveDateTime:r.effectiveDateTime,issued:r.issued,sourceVersion:r.meta?.versionId});
  }
 }else if(['csv','tsv','xlsx'].includes(source.format)){
  if(source.warnings.some(w=>w.startsWith('Formula')))throw Error('Formula cells must be resolved to source values before this release profile can be used.');
  const records=new Map<string,Record<string,string>>();
  for(const s of source.segments){const parts=s.label.split(' · ');const column=parts.slice(2).join(' · ');const row=`${parts[0]}:${parts[1]?.match(/\d+/)?.[0]}`;const record=records.get(row)||{};if(Object.prototype.hasOwnProperty.call(record,column))throw Error('Duplicate column names require source correction.');record[column]=s.text;records.set(row,record);}
  for(const r of records.values()){if(r.resourceType&&r.resourceType!=='Observation')throw Error('Unexpected resource type in laboratory row.');labs.push({...r,resourceType:'Observation',value:r.value===undefined?null:Number(r.value),...(r.referenceRange?{referenceRange:JSON.parse(r.referenceRange)}:{})});}
 }else throw Error('This file can be reviewed and exported as evidence. The laboratory release profile accepts FHIR and tabular laboratory extracts.');
 if(!labs.length)throw Error('No laboratory observations found.');
 const validated=labs.map(l=>LabInput.parse(l));
 if(validated.some(l=>!PATIENTS.some(p=>p.id===l.patient)))throw Error('This release profile only accepts SYN-001 through SYN-012 and the supplied fixture authority.');
 return validated;
}
