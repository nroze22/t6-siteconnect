import {isTauri} from '@/lib/tauri';
type Snapshot={revision:number;payload:string;digest:string};
const revisions=new Map<string,number>();
const queues=new Map<string,Promise<unknown>>();
export async function readJournal(name:string):Promise<string|null>{
 if(!isTauri)return null;
 const {invoke}=await import('@tauri-apps/api/core');
 const saved=await invoke<Snapshot|null>('read_operation',{name});revisions.set(name,saved?.revision??0);return saved?.payload??null;
}
export function writeJournal(name:string,payload:string):Promise<void>{
 if(!isTauri)return Promise.resolve();
 const next=(queues.get(name)??Promise.resolve()).catch(()=>{}).then(async()=>{
  if(!revisions.has(name))await readJournal(name);
  const {invoke}=await import('@tauri-apps/api/core');const saved=await invoke<Snapshot>('write_operation',{name,revision:revisions.get(name),payload});revisions.set(name,saved.revision);
 });queues.set(name,next);return next;
}
