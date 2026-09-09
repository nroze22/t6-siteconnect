import {useEffect,useState} from 'react';
import {CheckCircle2,Play,ArrowRight,Brain,ClipboardCheck} from 'lucide-react';
import {isTauri} from '@/lib/tauri';
import {detectSystemHardware,getLlmStatus,testOllamaInference} from '@/lib/data-provider';
import {buildRun,NOTE} from '@/lib/data-counts/engine';
import {reviewNote,type NoteReview} from '@/lib/data-counts/note-review';

export function NoteDemo(){
 const [busy,setBusy]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState('');
 const [data,setData]=useState<{review:NoteReview;model:string;latency:number}|null>(null),[accepted,setAccepted]=useState<number[]>([]);
 useEffect(()=>{if(!busy)return;const t=Date.now();const id=setInterval(()=>setSeconds(Math.floor((Date.now()-t)/1000)),1000);return()=>clearInterval(id);},[busy]);
 async function extract(){setBusy(true);setError('');setData(null);setAccepted([]);setSeconds(0);try{
  if(!isTauri)throw Error('Live extraction requires the desktop app. Browser preview never substitutes a canned result.');
  const {invoke}=await import('@tauri-apps/api/core');
  const raw=await invoke<{model:string;latency_ms:number;result:unknown}>('extract_demo_note');
  setData({review:reviewNote(raw.result),model:raw.model,latency:raw.latency_ms});
 }catch(e){setError(String(e));}finally{setBusy(false);}}
 return <section className="dc-panel"><span className="dc-eyebrow"><Brain size={15}/> LOCAL AI · REVIEW BEFORE ACCEPTING</span><h2>From a note to source-backed suggestions</h2><p>Extract two measurements locally, then compare each suggestion with the exact words in the note. This review does not modify laboratory records or authorize a release.</p><div className="dc-columns mt-5"><div><h3>Original synthetic note · August 6</h3><blockquote>{NOTE}</blockquote><p>Later source corrections belong to the laboratory workflow. This original note stays unchanged.</p><button className="dc-btn primary mt-4" disabled={busy||!isTauri} onClick={()=>void extract()}>{busy?`Extracting locally · ${seconds}s`:'Extract synthetic note'}<ArrowRight size={14}/></button>{!isTauri&&<p className="mt-3">Desktop required for live AI. No simulated model output.</p>}{busy&&<p role="status" className="mt-3">Please allow up to 3 minutes. This panel must remain open; the laboratory workflow works without AI.</p>}{error&&<p role="alert" className="dc-error">{error} Open Administration → Model setup to verify the model, then retry.</p>}</div><div aria-live="polite">{!data?<div className="dc-empty"><ClipboardCheck size={28}/><h3>Your evidence review appears here</h3><p>Model suggestions are checked against this fixed demonstration note. Missing or unsupported content cannot be accepted.</p></div>:<><p>{data.model} · {(data.latency/1000).toFixed(1)}s · live local response</p><p className="mt-2">Patient: {data.review.patient} · {data.review.complete?'Both expected measurements found':'Incomplete or unsupported extraction — retry or inspect the source'}</p>{data.review.rows.map((r,i)=><div className="dc-evidence-card" key={i}><h3>{r.test} · {r.value} {r.unit}</h3><blockquote>“{r.quote}”</blockquote><p>{r.supported?'Exact supporting text found in this synthetic note':'Not supported by the fixed source — acceptance blocked'}</p><label className="dc-check"><input type="checkbox" disabled={!r.supported||!data.review.complete} checked={accepted.includes(i)} onChange={e=>setAccepted(a=>e.target.checked?[...a,i]:a.filter(n=>n!==i))}/>I compared this suggestion with its source.</label></div>)}{data.review.complete&&accepted.length===2&&<div className="dc-notice"><CheckCircle2 size={18}/>Both suggestions reviewed for this rehearsal. Nothing was imported or added to the release.</div>}</>}</div></div></section>;
}

type Check={title:string;detail:string;ok:boolean};
export function DemoPreparation({saved,pending,onStart,onModel}:{saved:boolean;pending:boolean;onStart:()=>void;onModel:()=>void}){
 const [busy,setBusy]=useState(false),[checks,setChecks]=useState<Check[]>([]),[at,setAt]=useState('');
 async function prepare(){setBusy(true);setChecks([]);setAt('');
 const add=(c:Check)=>setChecks(s=>[...s,c]);
 try{const baseline=await buildRun(false,false);const fixed=await buildRun(true,false);add({title:'Laboratory story',ok:baseline.issues.length===2&&fixed.output.length===120&&!fixed.issues.length,detail:`${baseline.issues.length} deliberate source blockers → ${fixed.output.length} prepared observations after correction.`});}catch(e){add({title:'Laboratory story',ok:false,detail:String(e)});}
 if(isTauri){try{const {invoke}=await import('@tauri-apps/api/core');const detail=await invoke<string>('check_demo_export');add({title:'Export preparation',ok:true,detail});}catch(e){add({title:'Export preparation',ok:false,detail:String(e)});}
 try{const hw=await detectSystemHardware();add({title:'Working space',ok:hw.free_disk_gb>=1,detail:hw.free_disk_gb?`${hw.free_disk_gb.toFixed(1)} GiB free. Rehearsal working-space check; model installation has separate requirements.`:'Space unavailable. Open Model setup and check the device.'});}catch(e){add({title:'Working space',ok:false,detail:String(e)});}
 try{const status=await getLlmStatus();if(status.status!=='running')throw Error('Verify the installed model in Model setup first. The core walkthrough still works.');const response=await testOllamaInference();add({title:'Optional local AI',ok:response.success,detail:response.success?`${status.model_name} responded in ${response.latency_ms} ms. Run the note once before presenting.`:response.error||'Model did not respond.'});}catch(e){add({title:'Optional local AI',ok:false,detail:String(e)});}
 }else add({title:'Desktop checks',ok:false,detail:'Browser preview: hardware, native file export and local AI must be checked in the desktop app.'});
 setAt(new Date().toLocaleTimeString());setBusy(false);
 }
 const coreReady=checks.some(c=>c.title==='Laboratory story'&&c.ok)&&checks.filter(c=>c.title!=='Optional local AI'&&c.title!=='Desktop checks').every(c=>c.ok);
 return <section className="dc-panel mb-4"><span className="dc-eyebrow"><Play size={15}/> BEFORE THE AUDIENCE ARRIVES</span><h2>Prepare a reliable demonstration</h2><p>Check this machine, then start the guided story from the original synthetic extract. Starting replaces the current rehearsal; native journal history is retained.</p><div className="dc-actions mt-4"><button className="dc-btn primary" disabled={busy} onClick={()=>void prepare()}>{busy?'Checking preparation…':'Check demo preparation'}</button><button className="dc-btn" onClick={onModel}>Model setup</button></div><div className="dc-prep-grid mt-4"><div className="dc-prep-item"><strong>{saved?'Session saved':'Session not saved'}</strong><p>{pending?'A receipt is still unknown. Reconcile it before starting a fresh demo.':'Current delivery state is clear.'}</p></div>{checks.map(c=><div className="dc-prep-item" key={c.title}><strong>{c.ok?'✓':'!'} {c.title}</strong><p>{c.detail}</p></div>)}</div>{at&&<p className="mt-3">Checked at {at}. Recheck after changing the model or environment.</p>}<button className="dc-btn primary mt-4" disabled={busy||!saved||pending||!coreReady} onClick={onStart}>Start fresh guided demo <ArrowRight size={15}/></button><p className="mt-3">Before presenting: export to your chosen folder, test offline after setup, and keep the captioned walkthrough available as backup.</p></section>;
}

const steps=[
 {title:'The request',tab:'Request',time:'0:00–0:40',cue:'Explain the adult cohort, August window and requested fields. This is a synthetic request, not a live NIH connection.'},
 {title:'Catch the source problem',tab:'Issues',time:'0:40–1:30',cue:'Run quality checks. Inspect the missing unit and duplicate. Load the supplied corrected source v2, then run checks again.'},
 {title:'Show local AI',tab:'Local AI',time:'1:30–2:30',cue:'Extract the original note. Compare both measurements with quoted evidence. Review each suggestion; nothing enters the release automatically.'},
 {title:'What leaves the site?',tab:'Release & delivery',time:'2:30–3:40',cue:'Review 120 observations, 24 exclusions and the destination. Inspect one source/output record. Check review, authorize the demo package and export.'},
 {title:'Recover the receipt',tab:'Release & delivery',time:'3:40–4:30',cue:'Simulate send with a lost receipt. Reload or reopen the app, then check the receipt. The ingestion count must stay at one.'},
 {title:'Close with the next step',tab:'Overview',time:'4:30–5:00',cue:'Show the reconciled package. Optional: load laboratory changes to compare five changed records. Explain the hospital integrations still required.'},
];
export function PresenterGuide({onNavigate,onClose}:{onNavigate:(tab:string)=>void;onClose:()=>void}){
 const [index,setIndex]=useState(()=>{try{return Math.min(5,Math.max(0,Number(sessionStorage.getItem('dc-presenter-step'))||0));}catch{return 0;}});
 const step=steps[index]!;
 function move(n:number){setIndex(n);try{sessionStorage.setItem('dc-presenter-step',String(n));}catch{}onNavigate(steps[n]!.tab);}
 return <aside className="dc-presenter" aria-label="Presenter guide"><div><span className="dc-kicker">PRESENTER GUIDE · {index+1}/6 · {step.time}</span><h3>{step.title}</h3><p>{step.cue}</p></div><div className="dc-actions"><button className="dc-btn" disabled={!index} onClick={()=>move(index-1)}>Back</button><button className="dc-btn primary" onClick={()=>index<5?move(index+1):onClose()}>{index<5?'Next cue':'Finish guide'}</button><button className="dc-btn" onClick={onClose}>Hide guide</button></div></aside>;
}
