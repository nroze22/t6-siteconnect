import {useEffect,useState,type FormEvent} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {isTauri} from '@/lib/tauri';

/** Local database access only. Does not confer hospital permissions or release approval. */
export function ConnectionStorage({onReady,onClose}:{onReady:()=>void;onClose:()=>void}){
 const [exists,setExists]=useState<boolean|null>(null),[pass,setPass]=useState(''),[confirm,setConfirm]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setExists(null);setError('');
  if(!isTauri){setError('Connection storage requires the native desktop app.');return;}
  // Do not use the legacy helper: it converts inspection errors into "no database".
  void invoke<boolean>('check_database_exists').then(value=>{if(active)setExists(value);}).catch(()=>{if(active)setError('Could not inspect local storage. Retry; existing data has not been reset.');});
  return()=>{active=false;};
 },[attempt]);
 const valid=exists===true?pass.length>0:exists===false&&pass.length>=12&&pass===confirm&&saved;
 async function submit(e:FormEvent){e.preventDefault();if(!valid||busy||!isTauri)return;setBusy(true);setError('');
  try{
   const current=await invoke<boolean>('check_database_exists');
   if(current!==exists){setExists(current);setPass('');setConfirm('');setSaved(false);setError('Local storage changed. Review the updated form before continuing.');return;}
   await invoke(current?'unlock_database':'init_database',{passphrase:pass});setPass('');setConfirm('');onReady();
  }catch{setError(exists?'Storage could not be unlocked. Check your passphrase and try again. No data was reset.':'Storage could not be created. Check available disk space and access, then retry. No reset was requested.');}
  finally{setBusy(false);}
 }
 return <section className="dc-panel dc-storage" aria-label="Local connection storage"><span className="dc-eyebrow">DEVICE SETUP · CONNECTION CONFIGURATION</span><h3>{exists===null?'Check local connection storage':exists?'Unlock connection storage':'Create local connection storage'}</h3>
 <p>Connection settings use this device’s encrypted application database. Private signing keys and tokens use the OS credential store. This does not authenticate you to a hospital or enable live release.</p>
 {error&&<p className="dc-source-warning" role="alert">{error}</p>}
 {exists===null?<div className="dc-actions mt-3">{error&&isTauri&&<button className="dc-btn" onClick={()=>setAttempt(n=>n+1)}>Retry storage check</button>}<button className="dc-btn" onClick={onClose}>Back to connections</button></div>:<form onSubmit={submit}>
 <label className="dc-connection-field">{exists?'Database passphrase':'New database passphrase'}<input autoFocus type="password" autoComplete={exists?'current-password':'new-password'} value={pass} disabled={busy} onChange={e=>setPass(e.target.value)}/></label>
 {!exists&&<><p>Use at least 12 characters, ideally a long, unique passphrase. Save it in your approved password manager before continuing. There is no password-reset service.</p><label className="dc-connection-field">Confirm passphrase<input type="password" autoComplete="new-password" value={confirm} disabled={busy} onChange={e=>setConfirm(e.target.value)}/></label><label className="dc-check"><input type="checkbox" checked={saved} disabled={busy} onChange={e=>setSaved(e.target.checked)}/>I have saved this passphrase and understand it is required to reopen the database.</label></>}
 {exists&&<p>Use the passphrase from the existing SiteConnect database. If unavailable, contact the local owner; this screen will not delete or replace the database.</p>}
 <div className="dc-actions mt-4"><button type="submit" className="dc-btn primary" disabled={!valid||busy}>{busy?'Opening local storage…':exists?'Unlock storage':'Create storage'}</button><button type="button" className="dc-btn" disabled={busy} onClick={onClose}>Back to connections</button></div></form>}
 </section>;
}
