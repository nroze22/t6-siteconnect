import json,time,urllib.request
from pathlib import Path
spec=json.loads(Path('src/lib/data-counts/note-spec.json').read_text())
body=spec['request']|{'model':'gemma4:e2b'}
Path('work').mkdir(exist_ok=True)
results=[]
for i in range(3):
 start=time.monotonic()
 req=urllib.request.Request('http://127.0.0.1:11434/api/chat',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=180) as r: raw=json.load(r)
  result=json.loads(raw['message']['content'])
  ok=result.get('patient')=='SYN-003' and len(result.get('labs',[]))==2
  for name,value,unit in [('creatinine',1.36,'mg/dL'),('potassium',4.44,'mmol/L')]:
   matches=[l for l in result.get('labs',[]) if l.get('test','').lower()==name]
   ok=ok and len(matches)==1 and matches[0].get('value')==value and matches[0].get('unit')==unit and bool(matches[0].get('quote')) and matches[0]['quote'] in spec['note'] and name in matches[0]['quote'].lower() and str(value) in matches[0]['quote'] and unit in matches[0]['quote']
  row={'run':i+1,'seconds':round(time.monotonic()-start,2),'passed':ok,'done_reason':raw.get('done_reason'),'result':result}
 except Exception as e: row={'run':i+1,'error':str(e),'passed':False}
 results.append(row);print(json.dumps(row),flush=True)
 Path('work/note-benchmark.json').write_text(json.dumps({'model':body['model'],'scope':'Fixed synthetic two-measurement note; not a clinical validation set','runs':results},indent=2))
