import {expect,it} from 'vitest';
import {buildRun} from './engine';
import {deliveryExport} from './export';
it('excludes internal evidence, paths and patient-level exclusion lists from delivery',async()=>{
 const run=await buildRun(true,false,undefined,false,{hash:'fixture-hash',name:'/private/source/SYN-012.json'});
 const result=await deliveryExport(run,run.digest,true,false);const json=JSON.stringify(result);
 expect(json).not.toContain('/private/source');expect(json).not.toContain('SYN-012');expect(json).not.toContain('sourceFile');expect(json).not.toContain('syntheticSourceEvidence');expect(result.payload.manifest).not.toHaveProperty('exclusions');
 expect(result.payload.observations).toHaveLength(120);expect(result.payload.manifest.outputCount).toBe(120);expect(result.integrity.authenticated).toBe(false);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(result.payload)))),b=>b.toString(16).padStart(2,'0')).join('');expect(result.integrity.sha256).toBe(hash);
});
it('rejects missing approval and post-review content changes',async()=>{
 const run=await buildRun(true,false);await expect(deliveryExport(run,null,true,false)).rejects.toThrow('Approve');run.output[0]!.value=999;
 await expect(deliveryExport(run,run.digest,true,false)).rejects.toThrow('content changed');
});
it('rejects a modified manifest even if observations are unchanged',async()=>{
 const run=await buildRun(true,false);run.cohortExcluded+=1;run.sourceCount+=1;
 await expect(deliveryExport(run,run.digest,true,false)).rejects.toThrow('Processing stages do not reconcile');
});
it('binds export to a snapshot before asynchronous hashing',async()=>{
 const run=await buildRun(true,false);const expected=run.output[0]!.value;const pending=deliveryExport(run,run.digest,true,false);run.output[0]!.value=999;
 expect((await pending).payload.observations[0]!.value).toBe(expected);
});
it('rejects stale input versions and invalid runs',async()=>{
 const run=await buildRun(true,false);await expect(deliveryExport(run,run.digest,true,true)).rejects.toThrow('Inputs changed');
 const invalid=await buildRun(false,false);await expect(deliveryExport(invalid,invalid.digest,false,false)).rejects.toThrow('valid run');
});
