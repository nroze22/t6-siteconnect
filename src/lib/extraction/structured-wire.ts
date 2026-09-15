import {z} from 'zod';
import {REQUEST} from '../data-counts/engine';
import profile from './request-profile.json';
import type {Segment} from './types';
const core={segment_id:z.string().min(1).max(300),quote:z.string().min(1).max(2500),value:z.string().min(1).max(1000),assertion:z.enum(['present','negated','historical','uncertain','unknown'])};
const lab=z.object({...core,field:z.literal('Observation.valueQuantity'),label:z.string().min(1).max(500),unit:z.string().min(1).max(100).nullable(),subject:z.string().min(1).max(100).nullable()}).strict();
const context=z.object({...core,field:z.string().refine(f=>f!=='Observation.valueQuantity'&&[...REQUEST.fields,'Patient.id','Patient.birthDate'].includes(f))}).strict();
export function normalizeWire(raw:unknown){const parsed=z.object({entities:z.array(z.union([lab,context])).max(24)}).strict().parse(raw);return {entities:parsed.entities.map(e=>'label' in e?{...e,kind:'lab'}:{...e,kind:'context',label:e.value,unit:null,subject:null})};}
export function sourceSchema(segments:Segment[]){const schema=structuredClone(profile.schema);for(const variant of schema.properties.entities.items.anyOf){Object.assign(variant.properties.segment_id,{enum:segments.map(s=>s.id)});}return JSON.parse(canonicalJson(schema)) as typeof schema;}

/** Match native serde_json key ordering when benchmarking the production prompt. */
export function canonicalJson(value:unknown):string {return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);}
