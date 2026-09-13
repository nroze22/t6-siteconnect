import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const api=await import(process.argv[2]);
const count=Number(process.argv[3]);
const fixture=(await api.buildRun(true,false,undefined,true)).output;
const rows=Array.from({length:count},(_,i)=>{const source=fixture[i%fixture.length];const copy=Math.floor(i/fixture.length);return {...structuredClone(source),id:`BENCH-${i}`,patientToken:`BENCH-${copy}-${source.patientToken}`,provenance:{...source.provenance,sourceResource:`BENCH-${i}`}};});
const revised=structuredClone(rows);
// Deterministic 1% corrections; never turn a missing/cancelled result into a measurement.
for(let i=0;i<revised.length;i+=100){revised[i].issued='2026-09-01T00:00:00.000Z';revised[i].provenance.sourceVersion='benchmark-correction-v2';}
const samples=[];
for(let repetition=0;repetition<4;repetition++){
 const cpuStart=process.cpuUsage(),start=performance.now();
 const hashStart=performance.now();
 const base={digest:await api.hashValue({version:1,rows}),rows};
 const target={digest:await api.hashValue({version:2,rows:revised}),rows:revised};
 const hashMs=performance.now()-hashStart;
 const planStart=performance.now();const plan=await api.planRefresh(base,target);const planMs=performance.now()-planStart;
 const serializeStart=performance.now();const serialized=JSON.stringify(plan);const parsed=JSON.parse(serialized);const serializeMs=performance.now()-serializeStart;
 const applyStart=performance.now();const result=await api.applyRefresh(base,parsed);const applyMs=performance.now()-applyStart;
 const elapsedMs=performance.now()-start,cpu=process.cpuUsage(cpuStart);
 assert.deepEqual(result.snapshot,target);
 assert.equal((await api.applyRefresh(result.snapshot,parsed)).status,'already-applied');
 assert.equal(plan.upserts.length,Math.ceil(count/100));
 if(repetition) samples.push({elapsedMs,hashMs,planMs,serializeMs,applyMs,cpuMs:(cpu.user+cpu.system)/1000,rowsPerSecond:count/(elapsedMs/1000),planBytes:Buffer.byteLength(serialized)});
}
console.log(JSON.stringify({rows:count,changes:Math.ceil(count/100),samples,processPeakRssBytes:process.resourceUsage().maxRSS*1024,peakScope:'Entire isolated worker including fixture generation, warm-up, timed work and assertions; not per-stage memory',correctness:'Exact target equality, expected change count and idempotent replay passed'}));
