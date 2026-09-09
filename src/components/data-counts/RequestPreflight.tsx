import {useRef,useState} from 'react';
import {Download,Upload} from 'lucide-react';
import {MAX_REQUEST_BYTES,parseRequest,REQUEST_TEMPLATE,requestJsonSchema,type RequestPreflight as Report} from '@/lib/data-counts/request-preflight';

type Loaded={name:string;sha256:string;checkedAt:string;report:Report};
export function RequestPreflight({download}:{download:(name:string,value:unknown)=>Promise<void>}){
 const input=useRef<HTMLInputElement>(null);const [loaded,setLoaded]=useState<Loaded|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function load(file:File){
  setBusy(true);setError('');
  try{
   if(file.size>MAX_REQUEST_BYTES)throw Error('Request is too large. Maximum size is 256 KiB.');
   const bytes=await file.arrayBuffer();const report=parseRequest(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   const hash=await crypto.subtle.digest('SHA-256',bytes);
   setLoaded({name:file.name,sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),checkedAt:new Date().toISOString(),report});
  }catch(e){setError(e instanceof Error?e.message:'The request could not be read.');}finally{setBusy(false);}
 }
 return <section className="dc-panel mt-5" aria-labelledby="request-preflight-title">
  <span className="dc-eyebrow">REQUEST READINESS · LOCAL CHECK</span>
  <h2 id="request-preflight-title">Check a new request before implementation</h2>
  <p>1. Download the template. 2. Describe the requested sources, fields, schedule and permissions. 3. Upload the JSON to see what needs work.</p>
  <p className="mt-3">This checks the specification only. It does not approve or activate a request, connect to a hospital, or change the current rehearsal. Request content is held in memory in this workspace; export the report before closing or reloading.</p>
  <div className="dc-actions mt-3">
   <button className="dc-btn" onClick={()=>void download('siteconnect-request-template.json',REQUEST_TEMPLATE)}><Download size={15}/>Get request template</button>
   <button className="dc-btn primary" disabled={busy} onClick={()=>input.current?.click()}><Upload size={15}/>{busy?'Checking request…':'Check request JSON'}</button>
   <button className="dc-btn" onClick={()=>void download('siteconnect-request-schema.json',requestJsonSchema())}>Download format schema</button>
   <input ref={input} type="file" accept=".json,application/json" aria-label="Request specification JSON" hidden disabled={busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void load(f);}}/>
  </div>
  {error&&<p className="mt-3" role="alert">{error}{loaded?' The previous report remains below; it is not a result for the failed upload.':''}</p>}
  {loaded&&<div className="mt-5">
   <h3 role="status">{loaded.report.schemaValid?'Format valid · execution blocked':'Request needs corrections · execution blocked'}</h3>
   <p>{loaded.name}{loaded.report.specification?` · ${loaded.report.specification.id} · version ${loaded.report.specification.version}`:''}</p>
   <p className="mt-3">{loaded.report.schemaValid?'Required sections are present. The findings below still need resolution before production use. Source availability and approval have not been verified.':'Correct the listed fields in your request file, then upload it again.'}</p>
   <ul className="mt-3">{loaded.report.findings.map((f,i)=><li key={`${f.code}-${i}`} className="mb-3"><strong>{({'approval':'Approval authority','request':'Execution','approval.status':'Approval status','approval.approvedAt':'Approval time','id / version':'Request identity','sourceSystems':'Source systems','domains':'Data domains','fields':'Requested fields','cohort':'Cohort','dateRange':'Date range','mode':'Extract mode','cadence':'Schedule','permissions':'Permissions','outputSchema':'Output schema'} as Record<string,string>)[f.field]??f.field}</strong>: {f.message}</li>)}</ul>
   <details><summary>File identity and check time</summary><p className="mt-3" style={{overflowWrap:'anywhere'}}>SHA-256: {loaded.sha256}<br/>Checked: {loaded.checkedAt}. The hash identifies the uploaded bytes; it does not prove authenticity.</p></details>
   <p className="mt-3">The exported report contains the request specification. Review it before sharing.</p>
   <div className="dc-actions mt-3"><button className="dc-btn" disabled={busy} onClick={()=>void download('siteconnect-request-readiness.json',loaded)}><Download size={15}/>Export readiness report</button><button className="dc-btn" disabled={busy} onClick={()=>{setLoaded(null);setError('');}}>Clear request review</button></div>
  </div>}
 </section>;
}
