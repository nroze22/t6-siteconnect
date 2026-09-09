"""Repeatable synthetic parser benchmark. No model extraction or clinical accuracy claim."""
import argparse,json,subprocess,sys,time,statistics
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--python',required=True);p.add_argument('--root',required=True);p.add_argument('--output',default='work/docling-benchmark.json');args=p.parse_args()
expected=json.loads(Path('sample-data/docling/expected.json').read_text());results=[]
for name,want in expected.items():
 command=[args.python,'docling-worker/worker.py','convert','--root',args.root,'--input',str(Path('sample-data/docling')/name)]
 if sys.platform=='darwin':command=['/usr/bin/sandbox-exec','-p','(version 1)(allow default)(deny network*)']+command
 start=time.monotonic();proc=subprocess.run(command,capture_output=True,text=True,timeout=330);wall=time.monotonic()-start
 try:r=json.loads(proc.stdout)
 except Exception:r={'error':'Worker returned invalid output'}
 if 'error' in r:results.append({'file':name,'passed':False,'error':r['error'],'wallSeconds':wall});continue
 text='\n'.join(s['text'] for s in r['segments']);missing=[phrase for phrase in want['phrases'] if phrase not in text]
 found=[]
 for t in r['tables']:
  d=t['data']
  for row in range(d['num_rows']):
   values=['']*d['num_cols']
   for c in d['table_cells']:
    if c['start_row_offset_idx']<=row<c['end_row_offset_idx']:values[c['start_col_offset_idx']]=c['text']
   found.append(values[:3])
 missing_rows=[row for row in want.get('tableRows',[]) if row not in found]
 Path('work',name+'.docling.json').write_text(json.dumps(r,indent=2))
 entry={'file':name,'passed':not missing and not missing_rows and not r['warnings'],'wallSeconds':round(wall,3),'processingSeconds':r['elapsedSeconds'],'missingPhrases':missing,'missingRows':missing_rows,'warnings':r['warnings'],'settings':r['settings'],'version':r['version']}
 results.append(entry);print(name,entry['passed'],round(wall,2),flush=True)
report={'scope':'Three synthetic development documents; not a held-out clinical validation set','network':'macOS sandbox denies network during each worker execution' if sys.platform=='darwin' else 'Worker offline configuration','cases':results,'passed':sum(r['passed'] for r in results),'medianWallSeconds':round(statistics.median(r['wallSeconds'] for r in results),3)}
Path(args.output).write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
