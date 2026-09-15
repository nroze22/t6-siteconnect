import {sourceBundle} from '../data-counts/engine';
import type {Transport} from './fhir';
export const DEMO_BASE='https://synthetic.siteconnect.invalid/fhir';
export const demoTransport:Transport=async(url)=>{
 const u=new URL(url),resources=sourceBundle(true,true).entry.map(e=>e.resource);
 const json=(body:unknown)=>({status:200,body:JSON.stringify(body),contentType:'application/fhir+json'});
 if(u.pathname.endsWith('/metadata'))return json({resourceType:'CapabilityStatement',status:'active',kind:'instance',fhirVersion:'4.0.1',software:{name:'Synthetic connector fixture'},rest:[{mode:'server',resource:[{type:'Patient',interaction:[{code:'read'}]},{type:'Observation',interaction:[{code:'search-type'}]},{type:'DiagnosticReport',interaction:[{code:'search-type'}]},{type:'Group',operation:[{name:'export'}]}]}]});
 if(u.pathname.endsWith('/$export'))return {status:202,body:'',contentLocation:`${DEMO_BASE}/jobs/fixture`,retryAfter:'0'};
 if(u.pathname.endsWith('/jobs/fixture'))return json({transactionTime:'2026-09-01T00:00:00Z',requiresAccessToken:false,error:[],output:['Patient','Observation'].map(type=>({type,url:`${DEMO_BASE}/files/${type}`,count:resources.filter(r=>r.resourceType===type).length}))});
 if(u.pathname.includes('/files/'))return {status:200,body:resources.filter(r=>r.resourceType===u.pathname.split('/').pop()).map(r=>JSON.stringify(r)).join('\n'),contentType:'application/fhir+ndjson'};
 if(u.pathname.includes('/Patient/')){const found=resources.find(r=>r.resourceType==='Patient'&&r.id===u.pathname.split('/').pop());return found?json(found):{status:404,body:''};}
 const type=u.pathname.split('/').pop(),patient=u.searchParams.get('patient');const matches=resources.filter(r=>r.resourceType===type&&'subject' in r&&(r.subject as {reference:string}).reference===`Patient/${patient}`);
 return json({resourceType:'Bundle',type:'searchset',total:matches.length,entry:matches.map(resource=>({resource}))});
};
export const HL7_SAMPLE='MSH|^~\\&|LAB|SYNTHETIC-HOSPITAL|SITECONNECT|RESEARCH|20260901090000||ORU^R01|SYN-MSG-001|P|2.5.1\rPID|1||SYN-003^^^SYNTHETIC-HOSPITAL^MR||SYNTHETIC^PATIENT\rOBR|1||SYN-ORDER-1|24323-8^Basic metabolic panel^LN\rOBX|1|NM|2160-0^Creatinine^LN||1.18|mg/dL|0.7-1.3||||C|||20260806083000\rOBX|2|SN|2823-3^Potassium^LN||<^2.5|mmol/L|3.5-5.1||||F|||20260806083000\r';
