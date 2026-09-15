import {z} from 'zod';
import request from './request.json';

const text=z.string().trim().min(1).max(2000);
const identifier=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},'Use a valid calendar date');
const unique=(items:string[])=>new Set(items).size===items.length;
export const RequestSpecification=z.strictObject({
 format:z.literal('siteconnect-request/1'),id:identifier,version:z.number().int().positive().max(1000000),label:text,
 approval:z.strictObject({reference:text,authority:text,status:z.enum(['draft','approved']),approvedAt:z.iso.datetime().optional()}),
 cohort:z.strictObject({description:text,minimumAge:z.number().int().min(0).max(120),ageAsOf:date}),
 sourceSystems:z.array(identifier).min(1).max(32).refine(unique,'Source systems must be unique'),
 domains:z.array(identifier).min(1).max(32).refine(unique,'Domains must be unique'),
 fields:z.array(identifier).min(1).max(200).refine(unique,'Fields must be unique'),
 dateRange:z.strictObject({start:date,end:date}),mode:z.enum(['full','incremental']),
 cadence:z.strictObject({frequency:z.enum(['once','daily','weekly','monthly']),timezone:text}),
 permissions:z.strictObject({source:text,version:identifier,rule:text}),outputSchema:identifier,
}).superRefine((v,ctx)=>{
 if(v.dateRange.start>v.dateRange.end)ctx.addIssue({code:'custom',path:['dateRange','end'],message:'End must be on or after start'});
 if(v.approval.status==='approved'&&!v.approval.approvedAt)ctx.addIssue({code:'custom',path:['approval','approvedAt'],message:'Approved requests need an approval timestamp'});
});
export type RequestSpecificationType=z.infer<typeof RequestSpecification>;
export const REQUEST_TEMPLATE:RequestSpecificationType={
 format:'siteconnect-request/1',id:request.id,version:request.version,label:request.label,
 approval:{reference:'SYNTHETIC-ONLY',authority:request.authority,status:'draft'},
 cohort:{description:request.cohort,minimumAge:18,ageAsOf:'2026-08-01'},
 sourceSystems:['northfield-synthetic-laboratory'],domains:['laboratory'],fields:request.fields,
 dateRange:{start:request.start,end:request.end},mode:'full',cadence:{frequency:'once',timezone:'UTC'},
 permissions:{source:'synthetic-fixture',version:'1',rule:'Exclude SYN-012'},outputSchema:request.schema,
};
export type PreflightFinding={code:string;field:string;message:string};
export type RequestPreflight={format:'siteconnect-request-preflight/1';executionAllowed:false;specification:RequestSpecificationType|null;findings:PreflightFinding[];schemaValid:boolean};
export const MAX_REQUEST_BYTES=256*1024;
export function checkRequest(value:unknown):RequestPreflight{
 const parsed=RequestSpecification.safeParse(value);
 if(!parsed.success)return {format:'siteconnect-request-preflight/1',executionAllowed:false,specification:null,schemaValid:false,findings:parsed.error.issues.map(i=>({code:'invalid-specification',field:i.path.join('.')||'request',message:i.message}))};
 const r=parsed.data;const findings:PreflightFinding[]=[];
 const add=(code:string,field:string,message:string)=>findings.push({code,field,message});
 // Imported text is a declaration, never evidence of trusted site authorization.
 add('authority-unverified','approval','Site authorization cannot be verified by this alpha. An approved label or timestamp does not grant permission.');
 add('execution-unavailable','request','Imported requests are for readiness review only. The active synthetic laboratory rehearsal is unchanged.');
 if(r.approval.status==='draft')add('draft-request','approval.status','Obtain authorized site approval before production processing.');
 if(r.approval.approvedAt&&Date.parse(r.approval.approvedAt)>Date.now())add('future-approval','approval.approvedAt','Approval timestamp is in the future.');
 if(r.id!==request.id||r.version!==request.version)add('different-request','id / version','This identity or version differs from the active rehearsal. It cannot reuse its checks or approval.');
 for(const s of r.sourceSystems)if(s!=='northfield-synthetic-laboratory')add('unsupported-source','sourceSystems',`No configured connector for ${s}.`);
 for(const d of r.domains)if(d!=='laboratory')add('unsupported-domain','domains',`No release workflow for ${d}.`);
 for(const f of r.fields)if(!request.fields.includes(f))add('unsupported-field','fields',`No supported laboratory release field: ${f}. No substitute will be selected.`);
 if(r.cohort.minimumAge!==18||r.cohort.ageAsOf!=='2026-08-01'||r.cohort.description!==request.cohort)add('unsupported-cohort','cohort','The cohort differs from the fixed adult synthetic cohort; arbitrary cohort execution is unavailable.');
 if(r.dateRange.start!==request.start||r.dateRange.end!==request.end)add('unsupported-window','dateRange','Only the August 2026 synthetic window is exercised by the rehearsal.');
 if(r.mode!=='full')add('unsupported-refresh','mode','Production incremental extraction is unavailable; lifecycle examples are synthetic.');
 if(r.cadence.frequency!=='once'||r.cadence.timezone!=='UTC')add('unsupported-schedule','cadence','No recurring scheduler or timezone-specific execution is configured.');
 add('permissions-unverified','permissions','Permission source, rule and version are declarations; no authoritative site permission service is connected.');
 if(r.outputSchema!==request.schema)add('unsupported-output','outputSchema','The requested output schema has no release implementation.');
 return {format:'siteconnect-request-preflight/1',executionAllowed:false,specification:r,schemaValid:true,findings};
}
export function parseRequest(text:string):RequestPreflight{
 if(new TextEncoder().encode(text).byteLength>MAX_REQUEST_BYTES)throw Error('Request is too large. Maximum size is 256 KiB.');
 let value:unknown;try{value=JSON.parse(text);}catch{throw Error('This file is not valid JSON. Use the request template to check its format.');}
 return checkRequest(value);
}
export const requestJsonSchema=()=>z.toJSONSchema(RequestSpecification);
