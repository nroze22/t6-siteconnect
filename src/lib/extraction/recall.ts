import type {Entity,Segment} from './types';

/** Conservative source rules complement, never impersonate, the local model. */
export const RECALL_VERSION='source-recall/1';
const labs='creatinine|potassium|sodium|glucose|chloride|bicarbonate|calcium|albumin|hemoglobin|haemoglobin|platelets|WBC|RBC|BUN|urea|ALT|AST|bilirubin|HbA1c|eGFR|magnesium|phosphate|troponin';
const units='mmol/L|mg/dL|g/dL|g/L|mEq/L|U/L|IU/L|ng/mL|pg/mL|µmol/L|umol/L|%|10\\^9/L|10\\^3/uL|mL/min/1\\.73\\s*m²';
const value='[<>≤≥]?\\s*[-+]?\\d+(?:\\.\\d+)?';
export function directCandidates(segments:Segment[]):Entity[]{
 const out:Entity[]=[];
 for(const s of segments){
  function add(field:string,label:string,v:string,unit:string|null,start:number,end:number){
   const quote=s.text.slice(start,end);if(!quote.includes(label)||!quote.includes(v)||(unit&&!quote.includes(unit)))return;
   // Context is deliberately unconfirmed; exact copying is not clinical interpretation.
   out.push({id:`rule-${s.id}-${start}-${field}`,segment_id:s.id,field,kind:field==='Observation.valueQuantity'?'lab':'context',label,value:v,unit,subject:null,assertion:'unknown',quote,start,end,origin:'rule',supported:true});
  }
  const measurement=new RegExp(`\\b(${labs})\\b\\s*(?:(?:was|is|of|=|:)\\s*)?(${value})\\s*(${units})(?![A-Za-z/])`,'gi');
  for(const m of s.text.matchAll(measurement))add('Observation.valueQuantity',m[1]!,m[2]!.trim(),m[3]!,m.index!,m.index!+m[0].length);
  const metadata:[string,RegExp][]=[
   ['Patient.id',/\b(Patient ID|Patient|MRN)\s*[:#]?\s+([A-Z]+[-\d][A-Z\d-]*)\b/gi],
   ['Observation.id',/\b(Observation ID)\s*[:#]?\s+([A-Z\d-]+)\b/gi],
   ['Observation.code',/\b(Test code|LOINC(?: code)?)\s*[:#]?\s+(\d{1,8}-\d)\b/gi],
   ['Patient.birthDate',/\b(Birth date|DOB)\s*:?\s+(\d{4}-\d{2}-\d{2})\b/gi],
   ['Observation.effectiveDateTime',/\b(Observation time|Collection time|Collected)\s*:?\s+(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))/gi],
   ['Observation.issued',/\b(Issued)\s*:?\s+(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))/gi],
   ['Observation.status',/\b(Result status|Status)\s*:?\s+(final|preliminary|corrected|cancelled|amended)\b/gi],
   ['Observation.specimen',/\b(Specimen)\s*(?::|was|is)?\s+(serum|plasma|urine|whole blood|blood|CSF)\b/gi],
  ];
  for(const [field,re] of metadata)for(const m of s.text.matchAll(re))add(field,m[1]!,m[2]!,null,m.index!,m.index!+m[0].length);
  // Docling emits a header line followed by a single row, preserving empty columns.
  const lines=s.text.split('\n');
  if(lines.length===2&&lines[0]!.startsWith('Table headers: ')){
   const headers=lines[0]!.slice(15).split('|').map(x=>x.trim().toLowerCase());const cells=lines[1]!.split('|').map(x=>x.trim());
   const at=(names:string[])=>headers.findIndex(h=>names.includes(h));const ti=at(['test','analyte','test name']),vi=at(['result','value']),ui=at(['unit','units']);
   if(ti>=0&&vi>=0&&cells.length===headers.length&&cells[ti]&&new RegExp(`^${value}$`).test(cells[vi]||'')){
    const start=s.text.indexOf('\n')+1;add('Observation.valueQuantity',cells[ti]!,cells[vi]!,ui>=0?cells[ui]||null:null,start,s.text.length);
   }
  }
 }
 return out;
}
/** Same source occurrence, not just equal values; repeated observations remain distinct. */
export function mergeCandidates(rules:Entity[],models:Entity[]):Entity[]{
 const result=[...models];
 for(const rule of rules){const match=models.some(e=>e.supported&&e.segment_id===rule.segment_id&&(e.field||(e.kind==='lab'?'Observation.valueQuantity':undefined))===rule.field&&e.value===rule.value&&e.label.toLowerCase()===rule.label.toLowerCase()&&e.unit===rule.unit&&e.start<rule.end&&e.end>rule.start);if(!match)result.push(rule);}
 return result.sort((a,b)=>a.segment_id.localeCompare(b.segment_id)||a.start-b.start);
}
/** Audit measurement-like spans even when their test name is outside the rules' vocabulary. */
export function uncoveredMeasurements(segments:Segment[],entities:Entity[]){
 const gaps:{segment_id:string;start:number;end:number;text:string}[]=[];
 for(const s of segments)for(const m of s.text.matchAll(new RegExp(`(?:${value})\\s*(?:${units})(?![A-Za-z/])`,'gi'))){
  const start=m.index!,end=start+m[0].length;
  if(!entities.some(e=>e.supported&&e.segment_id===s.id&&['lab','vital','medication'].includes(e.kind)&&e.start<=start&&e.end>=end&&m[0].includes(e.value)))gaps.push({segment_id:s.id,start,end,text:m[0]});
 }
 return gaps;
}
