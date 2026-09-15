import type {Entity,Segment} from './types';
/** Gold annotations are explicit source occurrences, never model-generated expectations. */
export type ExpectedEntity=Pick<Entity,'segment_id'|'kind'|'label'|'value'|'unit'|'subject'|'assertion'|'start'|'end'> & {id:string;field:string|null};
export function evaluateExtraction(expected:ExpectedEntity[],actual:Entity[],segments:Segment[]){
 const sources=new Map(segments.map(s=>[s.id,s.text]));
 if(sources.size!==segments.length||new Set(expected.map(e=>e.id)).size!==expected.length)throw Error('Evaluation requires unique source and annotation IDs.');
 const occurrences=expected.map(({id:_,...e})=>JSON.stringify([e.segment_id,e.start,e.end,e.field,e.kind,e.label,e.value,e.unit,e.subject,e.assertion]));
 if(new Set(occurrences).size!==occurrences.length)throw Error('Duplicate gold occurrence.');
 for(const e of expected){if(e.field!==null&&typeof e.field!=='string')throw Error('Gold field must be explicit.');const source=sources.get(e.segment_id);if(source===undefined||!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<0||e.end<=e.start||e.end>source.length)throw Error('Invalid gold source occurrence.');const quote=source.slice(e.start,e.end);if(!quote.includes(e.label)||!quote.includes(e.value)||(e.unit!==null&&!quote.includes(e.unit))||(e.subject!==null&&!quote.includes(e.subject)))throw Error('Gold annotation fields must occur in their source span.');}
 const grounded=actual.map(e=>{const source=sources.get(e.segment_id);return e.supported&&source!==undefined&&Number.isInteger(e.start)&&Number.isInteger(e.end)&&e.start>=0&&e.end>e.start&&e.end<=source.length&&source.slice(e.start,e.end)===e.quote&&e.quote.includes(e.label)&&e.quote.includes(e.value)&&(e.unit===null||e.quote.includes(e.unit))&&(e.subject===null||e.quote.includes(e.subject));});
 const candidates=expected.map(g=>actual.flatMap((e,i)=>grounded[i]&&e.segment_id===g.segment_id&&e.start===g.start&&e.end===g.end&&(['kind','label','value','unit','subject','assertion'] as const).every(k=>e[k]===g[k])&&(e.field??null)===g.field?[i]:[]));
 // Maximum one-to-one matching: overlapping evidence cannot let one result satisfy two gold facts.
 const owner=new Map<number,number>();
 function match(g:number,seen:Set<number>):boolean{for(const a of candidates[g]!){if(seen.has(a))continue;seen.add(a);const previous=owner.get(a);if(previous===undefined||match(previous,seen)){owner.set(a,g);return true;}}return false;}
 expected.forEach((_,i)=>match(i,new Set()));
 const matched=new Set(owner.values());const truePositive=owner.size,falsePositive=actual.length-truePositive,falseNegative=expected.length-truePositive;
 return {truePositive,falsePositive,falseNegative,precision:actual.length?truePositive/actual.length:null,recall:expected.length?truePositive/expected.length:null,grounded:grounded.filter(Boolean).length,unsupported:grounded.filter(x=>!x).length,missing:expected.filter((_,i)=>!matched.has(i)).map(e=>e.id),extra:actual.flatMap((e,i)=>owner.has(i)?[]:[{index:i,id:e.id,grounded:grounded[i]}]),passed:falsePositive===0&&falseNegative===0};
}
