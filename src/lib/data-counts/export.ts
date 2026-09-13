import {REQUEST,authorize,type Run,type OutputLab} from './engine';

async function sha256(value:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
// Explicit output fields: internal run metadata and new review-only fields must never
// enter the delivery envelope merely because they were added to a source object.
function observation(l:OutputLab){
 return {resourceType:l.resourceType,id:l.id,status:l.status,specimen:l.specimen,code:l.code,display:l.display,system:l.system,value:l.value,unit:l.unit,unitSystem:l.unitSystem,
 ...(l.comparator!==undefined?{comparator:l.comparator}:{}),...(l.dataAbsentReason!==undefined?{dataAbsentReason:l.dataAbsentReason}:{}),
 ...(l.quantityCode!==undefined?{quantityCode:l.quantityCode}:{}),...(l.codingVersion!==undefined?{codingVersion:l.codingVersion}:{}),...(l.codingText!==undefined?{codingText:l.codingText}:{}),...(l.codingUserSelected!==undefined?{codingUserSelected:l.codingUserSelected}:{}),
 ...(l.referenceRange?{referenceRange:{low:l.referenceRange.low,high:l.referenceRange.high,unit:l.referenceRange.unit}}:{}),
 ...(l.referenceContext?{referenceContext:{text:l.referenceContext.text,lowSystem:l.referenceContext.lowSystem,lowCode:l.referenceContext.lowCode,highSystem:l.referenceContext.highSystem,highCode:l.referenceContext.highCode}}:{}),
 effectiveDateTime:l.effectiveDateTime,issued:l.issued,patientToken:l.patientToken,
 provenance:{sourceResource:l.provenance.sourceResource,sourceVersion:l.provenance.sourceVersion,transformation:l.provenance.transformation}};
}
export async function deliveryExport(run:Run,approval:string|null,corrected:boolean,revoked:boolean,lifecycle=false){
 run=structuredClone(run);
 const approved=authorize(run,corrected,revoked,lifecycle);
 if(approval!==approved)throw Error('Approve this exact package before exporting.');
 // Verify the same canonical review input used by buildRun, not just a saved string.
 const digest=await sha256({request:REQUEST,engineVersion:3,...(run.sourceFile?{sourceFile:run.sourceFile}:{}),source:run.revision,eligibility:run.eligibilityVersion,exclusions:run.exclusions,output:run.output});
 if(digest!==approved)throw Error('Reviewed content changed. Reprocess and approve before exporting.');
 const cohort=run.exclusions.filter(e=>e.reason==='Age below 18 at request start'||e.reason==='Outside requested UTC window').reduce((n,e)=>n+e.count,0);
 const permission=run.exclusions.filter(e=>e.reason==='Not permitted by fixture authority'||e.reason==='Permission revoked in fixture v2').reduce((n,e)=>n+e.count,0);
 if(run.packageId!==`DEMO-PKG-${approved.slice(0,12)}`||cohort!==run.cohortExcluded||permission!==run.permissionExcluded)throw Error('Export manifest differs from the reviewed run. Reprocess before exporting.');
 if(run.sourceCount!==run.cohortExcluded+run.permissionExcluded+run.output.length)throw Error('Export counts do not reconcile. Reprocess before exporting.');
 const payload={format:'siteconnect-demo-delivery/1',synthetic:true,warning:'Simulation only. Not approved de-identification or PPRL. Plaintext. Not for NIH submission.',request:REQUEST,
 manifest:{packageId:run.packageId,reviewDigest:approved,reviewDigestScope:'Local request, source identity, exclusions and prepared observations; not the delivery payload hash',sourceVersion:run.revision,eligibilityVersion:run.eligibilityVersion,sourceCount:run.sourceCount,cohortExcluded:run.cohortExcluded,permissionExcluded:run.permissionExcluded,outputCount:run.output.length},
 observations:run.output.map(observation)};
 return {payload,integrity:{algorithm:'SHA-256',scope:'UTF-8 JSON.stringify(payload)',sha256:await sha256(payload),authenticated:false}};
}
