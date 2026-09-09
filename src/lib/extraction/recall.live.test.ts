// Explicit opt-in: actual local Ollama only, synthetic fixtures only.
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NOTE,REQUEST} from '../data-counts/engine';
import profile from './request-profile.json';
import {normalizeWire,sourceSchema,canonicalJson} from './structured-wire';
import {validateEntities} from './review';
import {directCandidates,mergeCandidates,uncoveredMeasurements,RECALL_VERSION} from './recall';
it.skipIf(process.env.SITECONNECT_LIVE_RECALL!=='1')('benchmarks actual default Gemma plus source recovery',async()=>{
 const reports=[];
 for(const [name,text,expected] of [['built-in-note',NOTE,['1.36','4.44']],['request-context',readFileSync('sample-data/request-review/request-context.txt','utf8'),['SYN-003','OBS-003-1','2160-0','1.36','Serum','2026-08-06T08:30:00Z','2026-08-06T10:15:00Z','final','1970-04-12']]] as const){
 const segments=[{id:'s1',label:name,text}];const started=Date.now();
 const messages=[{role:'system',content:profile.system+'\nRequired JSON schema: '+JSON.stringify(sourceSchema(segments))+'\nRequest: '+canonicalJson(REQUEST)},{role:'user',content:JSON.stringify(segments.map(({id,text})=>({id,text})))}];
 let model:ReturnType<typeof validateEntities>=[];
 for(let attempt=0;attempt<2;attempt++){
 const response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gemma4:e2b',stream:false,think:profile.think,keep_alive:profile.keep_alive,options:profile.options,format:sourceSchema(segments),messages}),signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error(await response.text());const payload=await response.json();expect(payload.done_reason).not.toBe('length');model=validateEntities(normalizeWire(JSON.parse(payload.message.content)),segments);
 if(model.every(e=>e.supported))break;
 messages.push({role:'assistant',content:payload.message.content},{role:'user',content:profile.repair_instruction+JSON.stringify(model.filter(e=>!e.supported).map(e=>e.problem))});
 }
 const rules=directCandidates(segments),combined=mergeCandidates(rules,model);const found=(es:typeof combined)=>expected.filter(value=>es.some(e=>e.supported&&e.value===value));
 reports.push({name,model:'gemma4:e2b',profile:profile.version,recallProfile:RECALL_VERSION,seconds:(Date.now()-started)/1000,expectedValues:expected,modelMatched:found(model),combinedMatched:found(combined),ruleCandidates:rules,modelCandidates:model,combinedCandidates:combined,uncoveredMeasurements:uncoveredMeasurements(segments,combined)});
 mkdirSync('work',{recursive:true});writeFileSync('work/recall-live-benchmark.json',JSON.stringify(reports,null,2));
 expect(found(combined)).toHaveLength(expected.length);
 }
},360000);
