import {z} from 'zod';

// This is the supported synthetic laboratory projection, not a general FHIR validator.
// Strict objects prevent newly encountered context from silently disappearing.
const coding=z.object({system:z.string(),code:z.string(),display:z.string().optional(),version:z.string().optional(),userSelected:z.boolean().optional()}).strict();
const tag=z.object({system:z.literal('urn:talosix:demo'),code:z.literal('synthetic')}).strict();
const quantity=z.object({value:z.number().finite(),unit:z.string().optional(),system:z.string().optional(),code:z.string().optional(),comparator:z.literal('<').optional()}).strict();
const bound=z.object({value:z.number().finite(),unit:z.string(),system:z.string().optional(),code:z.string().optional()}).strict();
export const ObservationProfile=z.object({
 resourceType:z.literal('Observation'),id:z.string(),meta:z.object({versionId:z.string(),tag:z.array(tag).optional()}).strict(),
 status:z.enum(['final','corrected','cancelled']),
 category:z.array(z.object({coding:z.array(z.object({system:z.literal('http://terminology.hl7.org/CodeSystem/observation-category'),code:z.literal('laboratory')}).strict()).length(1)}).strict()).length(1).optional(),
 code:z.object({coding:z.array(coding).length(1),text:z.string().optional()}).strict(),
 subject:z.object({reference:z.string().regex(/^Patient\/SYN-\d{3}$/)}).strict(),specimen:z.object({display:z.enum(['Serum','Whole blood'])}).strict(),
 effectiveDateTime:z.string(),issued:z.string(),valueQuantity:quantity.optional(),
 dataAbsentReason:z.object({coding:z.array(z.object({system:z.literal('http://terminology.hl7.org/CodeSystem/data-absent-reason'),code:z.string()}).strict()).length(1)}).strict().optional(),
 referenceRange:z.array(z.object({low:bound,high:bound,text:z.string().optional()}).strict()).length(1).optional(),
}).strict().superRefine((r,ctx)=>{if(!!r.valueQuantity===!!r.dataAbsentReason)ctx.addIssue({code:'custom',message:'Supply exactly one measured quantity or missing-result reason.'});});
const patient=z.object({resourceType:z.literal('Patient'),id:z.string(),birthDate:z.string()}).strict();
const bundle=z.object({resourceType:z.literal('Bundle'),type:z.literal('collection'),id:z.string().optional(),meta:z.object({tag:z.array(tag)}).strict().optional(),entry:z.array(z.object({fullUrl:z.string().optional(),resource:z.unknown()}).strict())}).strict();
export function profileResources(parsed:unknown):unknown[]{
 if(Array.isArray(parsed))return parsed;
 if(parsed&&typeof parsed==='object'&&'resourceType' in parsed&&parsed.resourceType==='Bundle')return bundle.parse(parsed).entry.map(e=>e.resource);
 return [parsed];
}
export function profileResource(resource:unknown){
 if(resource&&typeof resource==='object'&&'resourceType' in resource&&resource.resourceType==='Patient')return patient.parse(resource);
 return ObservationProfile.parse(resource);
}
export function profileError(error:unknown):Error{
 if(error instanceof z.ZodError)return new Error(`Release profile cannot preserve or validate supplied content: ${error.issues.map(i=>`${i.path.join('.')||'resource'}: ${i.message}`).join('; ')}. Original content remains available in document evidence review.`);
 return error instanceof Error?error:new Error(String(error));
}
