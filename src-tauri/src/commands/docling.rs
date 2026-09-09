//! Managed local PDF/OCR worker. No uploaded URLs or arbitrary executable arguments.
use serde_json::{json, Value};
use std::{path::{Path,PathBuf},sync::{Arc,Mutex,atomic::{AtomicBool,Ordering}},process::Stdio};
use tauri::{AppHandle,Manager};
use tokio::process::Command;
static ACTIVE: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);
static PHASE: Mutex<&str> = Mutex::new("Not started");
struct Job;
impl Drop for Job { fn drop(&mut self){ if let Ok(mut a)=ACTIVE.lock(){*a=None;} } }
fn root(app:&AppHandle)->Result<PathBuf,String>{Ok(app.path().app_data_dir().map_err(|e|e.to_string())?.join("docling-v1"))}
fn python(root:&Path)->PathBuf {root.join(if cfg!(windows){"venv/Scripts/python.exe"}else{"venv/bin/python"})}
fn space(path:&Path)->u64 {let disks=sysinfo::Disks::new_with_refreshed_list();disks.iter().filter(|d|path.starts_with(d.mount_point())).max_by_key(|d|d.mount_point().components().count()).map(|d|d.available_space()).unwrap_or(0)}
fn phase(value:&'static str){if let Ok(mut p)=PHASE.lock(){*p=value;}}
fn begin()->Result<(Job,Arc<AtomicBool>),String>{let mut a=ACTIVE.lock().map_err(|e|e.to_string())?;if a.is_some(){return Err("Document reader is busy. Wait or cancel the current operation.".into());}let flag=Arc::new(AtomicBool::new(false));*a=Some(flag.clone());Ok((Job,flag))}
async fn run(mut command:Command,flag:&Arc<AtomicBool>,seconds:u64)->Result<Vec<u8>,String>{
 if flag.load(Ordering::SeqCst){return Err("Document operation cancelled.".into());}
 command.stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);
 #[cfg(unix)] { command.process_group(0); }
 let child=command.spawn().map_err(|e|format!("Could not start document reader: {e}"))?;
 let pid=child.id();let future=child.wait_with_output();tokio::pin!(future);
 let deadline=tokio::time::sleep(std::time::Duration::from_secs(seconds));tokio::pin!(deadline);
 let mut tick=tokio::time::interval(std::time::Duration::from_millis(150));
 loop{tokio::select!{
 result=&mut future=>{let output=result.map_err(|e|e.to_string())?;if output.stdout.len()>8*1024*1024{return Err("Document response exceeds the evidence limit.".into());}if !output.status.success(){let message=serde_json::from_slice::<Value>(&output.stdout).ok().and_then(|v|v["error"].as_str().map(str::to_owned));return Err(message.unwrap_or_else(||format!("Document worker failed ({}). Setup can be retried; check Python and download connectivity.",output.status)));}return Ok(output.stdout);},
 _=&mut deadline=>{kill_group(pid);return Err("Document reader timed out. No completed result was accepted.".into());},
 _=tick.tick()=>{if flag.load(Ordering::SeqCst){kill_group(pid);return Err("Document processing cancelled. No completed result was accepted.".into());}}
 }}
}
fn kill_group(pid:Option<u32>){#[cfg(unix)] if let Some(pid)=pid{unsafe{libc::kill(-(pid as i32),libc::SIGKILL);}} #[cfg(not(unix))] let _=pid;}
#[tauri::command]
pub fn cancel_docling(){if let Ok(a)=ACTIVE.lock(){if let Some(flag)=&*a{flag.store(true,Ordering::SeqCst);}}}
#[tauri::command]
pub fn docling_status(app:AppHandle)->Result<Value,String>{let dir=root(&app)?;let ready=std::fs::read(dir.join("ready.json")).ok().and_then(|b|serde_json::from_slice::<Value>(&b).ok()).filter(|v|v["profile"]=="docling-pdf/1"&&python(&dir).exists());Ok(json!({"ready":ready.is_some(),"details":ready,"freeBytes":space(&dir),"busy":ACTIVE.lock().map_err(|e|e.to_string())?.is_some(),"phase":*PHASE.lock().map_err(|e|e.to_string())?}))}
#[tauri::command]
pub async fn setup_docling(app:AppHandle)->Result<Value,String>{
 let (_job,flag)=begin()?;let dir=root(&app)?;std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
 if space(&dir)<6*1024*1024*1024{return Err("Allow at least 6 GiB free for the isolated document reader, models and working files.".into());}
 phase("Checking Python 3.12");
 if !python(&dir).exists(){
  let mut found=None;
  for candidate in ["/opt/homebrew/bin/python3.12","/usr/local/bin/python3.12","python3.12","python3"]{
   let mut cmd=Command::new(candidate);cmd.args(["-c","import sys; sys.exit(0 if sys.version_info[:2] == (3,12) else 1)"]);
   if run(cmd,&flag,15).await.is_ok(){found=Some(candidate);break;}
   if flag.load(Ordering::SeqCst){return Err("Setup cancelled.".into());}
  }
  let executable=found.ok_or("Python 3.12 is required for this alpha document reader. Install Python 3.12, then retry setup. The basic reader remains available.")?;
  phase("Creating isolated document runtime");let mut cmd=Command::new(executable);cmd.arg("-m").arg("venv").arg(dir.join("venv"));run(cmd,&flag,120).await?;
 }
 // Remove old readiness before changing any dependency or model.
 let _=std::fs::remove_file(dir.join("ready.json"));
 std::fs::write(dir.join("worker.py"),include_str!("../../../docling-worker/worker.py")).map_err(|e|e.to_string())?;
 std::fs::write(dir.join("requirements.txt"),include_str!("../../../docling-worker/requirements.txt")).map_err(|e|e.to_string())?;
 phase("Installing document reader packages — download in progress");let mut cmd=Command::new(python(&dir));cmd.args(["-m","pip","install","--disable-pip-version-check","--no-cache-dir","-r"]).arg(dir.join("requirements.txt"));run(cmd,&flag,1800).await?;
 phase("Downloading and verifying OCR and layout models");let mut cmd=Command::new(python(&dir));cmd.arg(dir.join("worker.py")).arg("prepare").arg("--root").arg(&dir);let result=run(cmd,&flag,1800).await?;
 phase("Ready for local PDF and scan processing");serde_json::from_slice(&result).map_err(|e|e.to_string())
}
#[tauri::command]
pub async fn parse_docling_pdf(app:AppHandle,bytes:Vec<u8>)->Result<Value,String>{
 if bytes.is_empty()||bytes.len()>12*1024*1024||!bytes.starts_with(b"%PDF-"){return Err("Use a PDF smaller than 12 MB.".into());}
 let (_job,flag)=begin()?;let dir=root(&app)?;
 if !dir.join("ready.json").exists()||!python(&dir).exists(){return Err("Set up the advanced PDF reader first, or choose the basic reader.".into());}
 if space(&dir)<1024*1024*1024{return Err("Allow at least 1 GiB free for document processing.".into());}
 // Use the current bundled worker, not a stale copy from an earlier build.
 std::fs::write(dir.join("worker.py"),include_str!("../../../docling-worker/worker.py")).map_err(|e|e.to_string())?;
 let path=dir.join(format!("synthetic-{}.pdf",uuid::Uuid::new_v4()));
 std::fs::write(&path,&bytes).map_err(|e|e.to_string())?;
 phase("Reading PDF layout, tables and scans locally");
 #[cfg(target_os="macos")]
 let mut cmd={let mut c=Command::new("/usr/bin/sandbox-exec");c.args(["-p","(version 1)(allow default)(deny network*)"]).arg(python(&dir));c};
 #[cfg(not(target_os="macos"))]
 let mut cmd=Command::new(python(&dir));
 cmd.current_dir(&dir).arg(dir.join("worker.py")).arg("convert").arg("--root").arg(&dir).arg("--input").arg(&path);
 let result=run(cmd,&flag,300).await;let _=std::fs::remove_file(&path);
 let output=result?;phase("Document parsed — review required");serde_json::from_slice(&output).map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
 use super::*;
 #[tokio::test]
 async fn cancellation_prevents_starting_an_executable(){
  let flag=Arc::new(AtomicBool::new(true));
  assert!(run(Command::new("nonexistent-docling-test-executable"),&flag,1).await.unwrap_err().contains("cancelled"));
 }
 #[cfg(unix)]
 #[tokio::test]
 async fn timeout_terminates_worker_group(){
  let flag=Arc::new(AtomicBool::new(false));let mut cmd=Command::new("/bin/sh");cmd.args(["-c","sleep 5"]);
  assert!(run(cmd,&flag,1).await.unwrap_err().contains("timed out"));
 }
}
