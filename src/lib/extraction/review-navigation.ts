import type {Entity} from './types';
import {FIELD_LABELS} from './request-review';
export function resultTitle(entity:Entity){return entity.kind==='context'&&entity.field?FIELD_LABELS[entity.field]||entity.label:entity.label;}
export function nextReviewId(entities:Entity[],selected:string,reviewed:string[],rejected:string[]){
 const start=entities.findIndex(e=>e.id===selected);
 for(let offset=1;offset<=entities.length;offset++){const e=entities[(start+offset)%entities.length]!;if(!reviewed.includes(e.id)&&!rejected.includes(e.id))return e.id;}
 return null;
}
