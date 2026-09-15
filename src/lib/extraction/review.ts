import {z} from 'zod';
import {REQUEST} from '@/lib/data-counts/engine';
import type {Segment,Entity} from './types';
const Candidate=z.object({field:z.string().refine(v=>[...REQUEST.fields,'Patient.id','Patient.birthDate'].includes(v)).optional(),segment_id:z.string(),kind:z.enum(['lab','medication','diagnosis','vital','demographic','context']),label:z.string().min(1).max(500),value:z.string().min(1).max(1000),unit:z.string().max(100).nullable(),subject:z.string().max(100).nullable(),assertion:z.enum(['present','negated','historical','uncertain','unknown']),quote:z.string().min(1).max(2500)}).strict();
export function validateEntities(raw:unknown,segments:Segment[]):Entity[]{
 const result=z.object({entities:z.array(Candidate).max(24)}).strict().parse(raw);
 return result.entities.map((e,i)=>{
  const s=segments.find(s=>s.id===e.segment_id);const start=s?.text.indexOf(e.quote)??-1;
  const unique=start>=0&&s!.text.indexOf(e.quote,start+1)<0;
  const diagnosisValid=e.kind!=='diagnosis'||e.value===e.label;
  const fieldConsistent=!e.field||(e.field==='Observation.valueQuantity'?e.kind==='lab':e.kind==='context'&&e.unit===null);
  const supported=fieldConsistent&&diagnosisValid&&unique&&e.quote.includes(e.label)&&e.quote.includes(e.value)&&(e.unit===null||(e.unit.length>0&&e.quote.includes(e.unit)))&&(e.subject===null||(e.subject.length>0&&e.quote.includes(e.subject)));
  return {...e,id:`${e.segment_id}-${i}`,origin:'model',start,end:start+e.quote.length,supported,problem:!fieldConsistent?'Requested field and entity category disagree':!diagnosisValid?'Diagnosis value must be the condition phrase; assertion carries uncertainty or negation':!s?'Unknown source segment':start<0?'Quote was not found exactly in the source':!unique?'Quote occurs more than once; source location is ambiguous':!supported?'A field is not present in the quoted passage':undefined};
 });
}
/** Segment boundaries are retained; no silent token truncation or cross-page quote joining. */
export function chunks(segments:Segment[],limit=5500){
 const result:Segment[][]=[];let current:Segment[]=[];let size=0;const bytes=(s:Segment)=>new TextEncoder().encode(s.text+s.id).length+150;
 for(const s of segments){if(bytes(s)>limit)throw Error(`${s.label} exceeds the extraction block limit.`);if(size+bytes(s)>limit&&current.length){result.push(current);current=[];size=0;}current.push(s);size+=bytes(s);}
 if(current.length)result.push(current);return result;
}
export function splitSegment(segment:Segment,max=2500):Segment[]{
 if(segment.text.length<=max)return [segment];
 const out:Segment[]=[];let start=0;
 while(start<segment.text.length){let end=Math.min(start+max,segment.text.length);if(end<segment.text.length){const boundary=segment.text.lastIndexOf(' ',end);if(boundary>start+max/2)end=boundary;}
  out.push({...segment,id:`${segment.id}-part${out.length+1}`,label:`${segment.label} · part ${out.length+1}`,text:segment.text.slice(start,end),runs:segment.runs?.filter(r=>r.end>start&&r.start<end).map(r=>({...r,start:Math.max(0,r.start-start),end:Math.min(end-start,r.end-start)}))});start=end;
 }
 return out;
}
