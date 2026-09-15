import {comparePackages,hashValue,type OutputLab} from './engine';
export type ReviewSnapshot={digest:string;rows:OutputLab[]};
export type RefreshPlan={format:'siteconnect-incremental-review/1';synthetic:true;mode:'local review only';baseReviewDigest:string;targetReviewDigest:string;baseRowsDigest:string;targetRowsDigest:string;targetOrder:string[];upserts:{kind:'added'|'updated';record:OutputLab}[];withdrawals:{id:string;reason:'absent from target snapshot; source deletion not established'}[];planDigest:string};
function unique(rows:OutputLab[]){if(rows.some(r=>!r.id)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Refresh snapshots need unique nonempty record IDs.');}
export async function planRefresh(base:ReviewSnapshot,target:ReviewSnapshot):Promise<RefreshPlan>{
 base=structuredClone(base);target=structuredClone(target);unique(base.rows);unique(target.rows);
 if(!base.digest||!target.digest)throw Error('Both reviewed snapshot identities are required.');
 if(base.digest===target.digest&&await hashValue(base.rows)!==await hashValue(target.rows))throw Error('One review identity cannot describe different snapshots.');
 const changes=comparePackages(base.rows,target.rows);if(changes.error)throw Error(changes.error);
 if(changes.changed.some(c=>c.identityChanged))throw Error('Patient token changed. Authoritative identity review is required before preparing an incremental plan; do not infer a merge or unmerge.');
 const added=new Set(changes.added),updated=new Set(changes.changed.map(c=>c.id));
 const content={format:'siteconnect-incremental-review/1' as const,synthetic:true as const,mode:'local review only' as const,baseReviewDigest:base.digest,targetReviewDigest:target.digest,baseRowsDigest:await hashValue(base.rows),targetRowsDigest:await hashValue(target.rows),
 upserts:target.rows.filter(r=>added.has(r.id)||updated.has(r.id)).map(record=>({kind:added.has(record.id)?'added' as const:'updated' as const,record})),withdrawals:changes.removed.map(id=>({id,reason:'absent from target snapshot; source deletion not established' as const})),
 // Output order is part of snapshot identity; an incremental apply must reproduce it.
 targetOrder:target.rows.map(r=>r.id)};
 return {...content,planDigest:await hashValue(content)};
}
export async function applyRefresh(current:ReviewSnapshot,input:RefreshPlan):Promise<{snapshot:ReviewSnapshot;status:'applied'|'already-applied'}>{
 current=structuredClone(current);const plan=structuredClone(input);unique(current.rows);
 const {planDigest,...content}=plan;
 if(plan.format!=='siteconnect-incremental-review/1'||plan.synthetic!==true||plan.mode!=='local review only'||await hashValue(content)!==planDigest)throw Error('Incremental plan integrity failed.');
 if(!plan.baseReviewDigest?.trim()||!plan.targetReviewDigest?.trim())throw Error('Both reviewed snapshot identities are required.');
 if(plan.baseReviewDigest===plan.targetReviewDigest&&plan.baseRowsDigest!==plan.targetRowsDigest)throw Error('One review identity cannot describe different snapshots.');
 const rowsDigest=await hashValue(current.rows);
 if(current.digest===plan.targetReviewDigest&&rowsDigest===plan.targetRowsDigest)return {snapshot:current,status:'already-applied'};
 if(current.digest!==plan.baseReviewDigest||rowsDigest!==plan.baseRowsDigest)throw Error('Wrong baseline. Reconcile the exact prior snapshot before applying this plan.');
 const next=new Map(current.rows.map(r=>[r.id,r]));const touched=new Set<string>();
 for(const withdrawal of plan.withdrawals){if(withdrawal.reason!=='absent from target snapshot; source deletion not established'||touched.has(withdrawal.id)||!next.has(withdrawal.id))throw Error('Invalid withdrawal.');touched.add(withdrawal.id);next.delete(withdrawal.id);}
 for(const change of plan.upserts){const id=change.record.id;if(touched.has(id)||(change.kind==='added'?next.has(id):change.kind==='updated'?!next.has(id):true))throw Error('Invalid refresh operation.');if(next.has(id)&&next.get(id)!.patientToken!==change.record.patientToken)throw Error('Identity changes require authoritative review.');touched.add(id);next.set(id,change.record);}
 if(!Array.isArray(plan.targetOrder)||new Set(plan.targetOrder).size!==plan.targetOrder.length||plan.targetOrder.length!==next.size||plan.targetOrder.some(id=>!next.has(id)))throw Error('Target record inventory is inconsistent.');
 const rows=plan.targetOrder.map(id=>next.get(id)!);unique(rows);if(await hashValue(rows)!==plan.targetRowsDigest)throw Error('Target snapshot did not reconcile.');
 return {snapshot:{digest:plan.targetReviewDigest,rows},status:'applied'};
}
