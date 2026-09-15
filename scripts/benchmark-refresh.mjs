import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir,cpus,totalmem,platform,release,arch} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=Number(process.env.BENCHMARK_BASE_ROWS??12000);
if(!Number.isSafeInteger(baseline)||baseline<120||baseline>100000)throw Error('BENCHMARK_BASE_ROWS must be an integer from120 to100000.');
const temporary=await mkdtemp(join(tmpdir(),'siteconnect-benchmark-'));
try{
 const module=join(temporary,'pipeline.mjs');
 await build({stdin:{contents:"export {buildRun,hashValue} from './src/lib/data-counts/engine'; export {planRefresh,applyRefresh} from './src/lib/data-counts/refresh';",resolveDir:root},bundle:true,platform:'node',format:'esm',outfile:module});
 const results=[];
 for(const scale of [1,2,5]){process.stderr.write(`Measuring ${scale}x (${baseline*scale} rows)…\n`);results.push({scale,...JSON.parse(execFileSync(process.execPath,[join(root,'scripts/performance/refresh-worker.mjs'),pathToFileURL(module).href,String(baseline*scale)],{encoding:'utf8',timeout:180000,maxBuffer:1024*1024}))});}
 const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 for(const result of results)result.summary={medianMs:median(result.samples.map(s=>s.elapsedMs)),medianRowsPerSecond:median(result.samples.map(s=>s.rowsPerSecond)),peakRssMiB:result.processPeakRssBytes/1024/1024};
 const sourceHashes={};for(const path of ['src/lib/data-counts/engine.ts','src/lib/data-counts/processing.ts','src/lib/data-counts/refresh.ts','scripts/benchmark-refresh.mjs','scripts/performance/refresh-worker.mjs','package-lock.json'])sourceHashes[path]=createHash('sha256').update(await readFile(join(root,path))).digest('hex');
 const report={sourceHashes,bundleSha256:createHash('sha256').update(await readFile(module)).digest('hex'),workingTreeStatus:execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim(),createdAt:new Date().toISOString(),revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),scope:'Synthetic Node component benchmark: full snapshot hashing, incremental planning, JSON round trip and application. Not hospital baseline or end-to-end processing.',excludes:['Source connectors and quality/cohort/permission execution','OCR and model inference','Native/browser UI and responsiveness','Encryption, disk persistence, network and broker','Staff time and target VM resource contention'],method:{baselineRows:baseline,scales:[1,2,5],warmupRuns:1,measuredRuns:3,changePattern:'Every 100th row starting at index0; actual count is ceil(rows/100)',workerIsolation:'Fresh process per scale; scales run sequentially',timing:'Includes hashing, plan generation, JSON serialization/parsing and apply; excludes fixture generation and correctness assertions'},hardware:{platform:platform(),release:release(),arch:arch(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),node:process.version},results};
 const folder=resolve(root,'docs/performance');await mkdir(folder,{recursive:true});await writeFile(join(folder,'refresh-latest.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(results.map(r=>({scale:r.scale,rows:r.rows,...r.summary})),null,2));
}finally{await rm(temporary,{recursive:true,force:true});}
