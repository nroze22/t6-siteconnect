/** Synthetic-only rehearsal engine. Never a production privacy or broker implementation. */
export type Patient = { id: string; birthDate: string; permitted: boolean };
export type Lab = { resourceType: 'Observation'; id: string; patient: string; status: 'final'; code: string; display: string; system: string; value: number; unit: string; unitSystem: string; effectiveDateTime: string; issued: string; sourceVersion: string };
export const REQUEST = { id: 'DC-LAB-2026-001', version: 1, label: 'Adult longitudinal laboratory extract', authority: 'Synthetic authorization for internal rehearsal only', cohort: 'Age 18 or older on 2026-08-01; laboratory observations in August 2026', start: '2026-08-01', end: '2026-08-31', mode: 'Full snapshot', fields: ['Observation.id', 'Observation.code', 'Observation.valueQuantity', 'Observation.effectiveDateTime', 'Observation.issued'], source: 'Northfield synthetic laboratory', schema: 'talosix-demo-labs/1', rfi: '75N95C26R00005' };
const VALUES = [[0.86,1.24,1.36,1.48,0.74,1.02,1.63,0.91,1.18,0.82,0.68,1.12],[14,22,19,28,11,16,31,13,24,15,10,18],[138,140,139,137,142,141,136,140,139,138,141,137],[4.1,4.6,4.44,4.9,3.8,4.2,5.1,4.0,4.5,3.9,4.1,4.3],[96,148,112,172,88,104,156,93,126,101,90,118],[13.8,12.1,14.2,11.6,13.4,15.1,10.9,14.4,12.7,13.9,13.2,12.5]];
const TESTS = [ ['2160-0','Creatinine','mg/dL',1.12], ['3094-0','Urea nitrogen','mg/dL',18], ['2951-2','Sodium','mmol/L',139], ['2823-3','Potassium','mmol/L',4.2], ['2345-7','Glucose','mg/dL',102], ['718-7','Hemoglobin','g/dL',13.8] ] as const;
export const PATIENTS: Patient[] = Array.from({length:12},(_,i)=>({ id:`SYN-${String(i+1).padStart(3,'0')}`,birthDate:i===10?'2010-04-12':`${1952+i*3}-04-12`,permitted:i!==11 }));
export function fixture(corrected=false): Lab[] {
 const labs: Lab[]=PATIENTS.flatMap((p,i)=>[0,1].flatMap(v=>TESTS.map(([code,display,unit],j)=>({resourceType:'Observation' as const,id:`OBS-${String(i+1).padStart(3,'0')}-${v+1}-${j+1}`,patient:p.id,status:'final' as const,code,display,system:'http://loinc.org',value:Number((VALUES[j]![i]!+v*([.06,-2,1,-.1,-8,.2][j]!)).toFixed(j===1||j===2||j===4?0:2)),unit,unitSystem:'http://unitsofmeasure.org',effectiveDateTime:`2026-08-${v?'20':'06'}T08:30:00Z`,issued:`2026-08-${v?'20':'06'}T10:15:00Z`,sourceVersion:corrected?'2':'1'}))));
 if(!corrected){labs[12]!.unit='';labs.push({...labs[0]!});}
 return labs;
}

/** FHIR R4 source representation; permissions are a separate fixture authority. */
export function sourceObservation(l:Lab){
 return {resourceType:'Observation',id:l.id,meta:{versionId:l.sourceVersion,tag:[{system:'urn:talosix:demo',code:'synthetic'}]},status:l.status,
  category:[{coding:[{system:'http://terminology.hl7.org/CodeSystem/observation-category',code:'laboratory'}]}],
  code:{coding:[{system:l.system,code:l.code,display:l.display}]},subject:{reference:`Patient/${l.patient}`},
  effectiveDateTime:l.effectiveDateTime,issued:l.issued,
  valueQuantity:{value:l.value,...(l.unit?{unit:l.unit,system:l.unitSystem,code:l.unit}:{})}};
}
export function sourceBundle(corrected:boolean){return {resourceType:'Bundle',type:'collection',id:`synthetic-laboratory-v${corrected?2:1}`,
 meta:{tag:[{system:'urn:talosix:demo',code:'synthetic'}]},
 entry:[...PATIENTS.map(p=>({resource:{resourceType:'Patient',id:p.id,birthDate:p.birthDate}})),...fixture(corrected).map(l=>({resource:sourceObservation(l)}))]};}

export type Issue={id:string;record:string;message:string;rfi:string};
export function quality(labs:Lab[]):Issue[]{
 const seen=new Set<string>();const issues:Issue[]=[];
 for(const l of labs){
  if(seen.has(l.id))issues.push({id:`duplicate-${l.id}`,record:l.id,message:'Duplicate source resource ID. Resolve the source extract; do not silently discard a row.',rfi:'3 · uniqueness'});
  seen.add(l.id);
  if(!l.unit)issues.push({id:`unit-${l.id}`,record:l.id,message:'Required source unit is missing. A familiar test name is not authority to infer its unit.',rfi:'2, 3, 6 · exact fields'});
  if(!Number.isFinite(l.value)||!l.code||!l.system)issues.push({id:`type-${l.id}`,record:l.id,message:'Missing code/system or invalid numeric value.',rfi:'3 · completeness and types'});
  if(!Number.isFinite(Date.parse(l.effectiveDateTime))||!Number.isFinite(Date.parse(l.issued))||Date.parse(l.issued)<Date.parse(l.effectiveDateTime))issues.push({id:`date-${l.id}`,record:l.id,message:'Invalid date or issued time precedes observation time.',rfi:'3 · date sequencing'});
 }
 return issues;
}
export function eligible(p:Patient){return p.birthDate<='2008-08-01';}
export type OutputLab=Omit<Lab,'patient'|'sourceVersion'> & {patientToken:string; provenance:{sourceResource:string;sourceVersion:string;transformation:string}};
export function transform(l:Lab):OutputLab{
 const index=PATIENTS.findIndex(p=>p.id===l.patient);if(index<0)throw Error('Unknown synthetic patient');
 const shift=-14+index;const shifted=(t:string)=>new Date(Date.parse(t)+shift*86400000).toISOString();
 const {patient:_,sourceVersion,...source}=l;
 return {...source,effectiveDateTime:shifted(l.effectiveDateTime),issued:shifted(l.issued),patientToken:`DEMO-TOKEN-${String(index+1).padStart(3,'0')}`,provenance:{sourceResource:l.id,sourceVersion,transformation:'Synthetic date-shift fixture v1; DEMO token is not approved PPRL'}};
}
export type Run={id:string;revision:number;eligibilityVersion:number;issues:Issue[];sourceCount:number;cohortExcluded:number;permissionExcluded:number;output:OutputLab[];digest:string;packageId:string};
export async function buildRun(corrected:boolean,revoked:boolean):Promise<Run>{
 const labs=fixture(corrected);const issues=quality(labs);
 const cohortExcluded=labs.filter(l=>!eligible(PATIENTS.find(p=>p.id===l.patient)!)).length;
 const permissionExcluded=labs.filter(l=>{const p=PATIENTS.find(p=>p.id===l.patient)!;return eligible(p)&&(!p.permitted||(revoked&&p.id==='SYN-003'));}).length;
 const output=issues.length?[]:labs.filter(l=>{const p=PATIENTS.find(p=>p.id===l.patient)!;return eligible(p)&&p.permitted&&!(revoked&&p.id==='SYN-003');}).map(transform);
 if(!issues.length&&labs.length!==cohortExcluded+permissionExcluded+output.length)throw Error('Counts do not reconcile');
 const canonical=JSON.stringify({request:REQUEST.id,version:REQUEST.version,source:corrected?2:1,eligibility:revoked?2:1,output});
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
 const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 return {id:`RUN-S${corrected?2:1}-E${revoked?2:1}`,revision:corrected?2:1,eligibilityVersion:revoked?2:1,issues,sourceCount:labs.length,cohortExcluded,permissionExcluded,output,digest,packageId:`DEMO-PKG-${digest.slice(0,12)}`};
}
export type Receipt={packageId:string;digest:string;count:number;status:'awaiting'|'reconciled'};
export function authorize(run:Run|null,corrected:boolean,revoked:boolean){
 if(!run||run.issues.length||!run.output.length)throw Error('Complete a valid run before approval.');
 if(run.revision!==(corrected?2:1)||run.eligibilityVersion!==(revoked?2:1))throw Error('Inputs changed. Reprocess and review the current package.');
 return run.digest;
}
export function send(run:Run|null,approval:string|null,corrected:boolean,revoked:boolean,receipts:Receipt[]):Receipt[]{
 const digest=authorize(run,corrected,revoked);if(approval!==digest)throw Error('Approve this exact package first.');
 if(receipts.some(r=>r.digest===digest))return receipts;
 return [...receipts,{packageId:run!.packageId,digest,count:run!.output.length,status:'awaiting'}];
}
export const NOTE='Synthetic laboratory note. Patient SYN-003. On August 6, 2026 at 08:30 UTC, creatinine was 1.36 mg/dL and potassium was 4.44 mmol/L. Specimens were reported at 10:15 UTC. No diagnosis is documented. Do not infer a diagnosis from laboratory results.';
