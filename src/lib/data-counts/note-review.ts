import {z} from 'zod';
import spec from './note-spec.json';
const Result=z.object({patient:z.string(),labs:z.array(z.object({test:z.string(),value:z.number(),unit:z.string(),quote:z.string()})).max(8)});
export function reviewNote(raw:unknown){
 const result=Result.parse(raw);
 const expected=[{test:'creatinine',value:1.36,unit:'mg/dL'},{test:'potassium',value:4.44,unit:'mmol/L'}];
 const rows=result.labs.map(l=>{
  const truth=expected.find(e=>e.test===l.test.toLowerCase());
  const supported=!!truth&&result.patient==='SYN-003'&&l.value===truth.value&&l.unit===truth.unit&&l.quote.length>0&&spec.note.includes(l.quote)&&l.quote.toLowerCase().includes(truth.test)&&l.quote.includes(String(truth.value))&&l.quote.includes(truth.unit);
  return {...l,supported};
 });
 const complete=rows.length===2&&expected.every(e=>rows.filter(r=>r.test.toLowerCase()===e.test&&r.supported).length===1);
 return {patient:result.patient,rows,complete};
}
export type NoteReview=ReturnType<typeof reviewNote>;
