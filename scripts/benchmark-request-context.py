from structured_wire import normalize_wire
from pathlib import Path
import json,time,urllib.request
p=json.loads(Path('src/lib/extraction/request-profile.json').read_text());definition=json.loads(Path('src/lib/data-counts/request.json').read_text());source=Path('sample-data/request-review/request-context.txt').read_text();body={'model':'gemma4:e2b','stream':False,'think':p['think'],'keep_alive':p['keep_alive'],'options':p['options'],'format':p['schema'],'messages':[{'role':'system','content':p['system']+'\nRequired JSON schema: '+json.dumps(p['schema'],separators=(',',':'))+'\nRequest: '+json.dumps(definition,separators=(',',':'))},{'role':'user','content':json.dumps([{'id':'s1','text':source}])}]};start=time.monotonic()
for attempt in range(1,3):
 req=urllib.request.Request('http://127.0.0.1:11434/api/chat',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=180) as f:r=json.load(f)
 wire=json.loads(r['message']['content']);parsed=normalize_wire(wire);errors=[]
 for i,e in enumerate(parsed['entities']):
  if e['segment_id']!='s1' or not e['quote'] or source.count(e['quote'])!=1:errors.append(f'Entity {i}: quote is not a unique exact source passage')
  for k in ['label','value','unit','subject']:
   if e[k] is not None and (not e[k] or e[k] not in e['quote']):errors.append(f'Entity {i}: {k} does not occur exactly in quote')
  if (e['field']=='Observation.valueQuantity' and e['kind']!='lab') or (e['field']!='Observation.valueQuantity' and (e['kind']!='context' or e['unit'] is not None)):errors.append(f'Entity {i}: requested field and category disagree; use lab for valueQuantity and context with null unit for other fields')
 if not errors or attempt==2:break
 body['messages'] += [{'role':'assistant','content':json.dumps(wire,separators=(',',':'))},{'role':'user','content':p['repair_instruction']+json.dumps(errors,separators=(',',':'))}]
expected={'Patient.id':'SYN-003','Observation.id':'OBS-003-1','Observation.code':'2160-0','Observation.valueQuantity':'1.36','Observation.specimen':'Serum','Observation.effectiveDateTime':'2026-08-06T08:30:00Z','Observation.issued':'2026-08-06T10:15:00Z','Observation.status':'final','Patient.birthDate':'1970-04-12'}
missing=[field for field,value in expected.items() if not any(e['field']==field and e['value']==value for e in parsed['entities'])]
report={'profile':p['version'],'source':source,'seconds':round(time.monotonic()-start,2),'attempts':attempt,'expected':expected,'missingFields':missing,'validationErrors':errors,'response':parsed,'doneReason':r.get('done_reason'),'passed':not missing and not errors and len(parsed['entities'])==len(expected) and r.get('done') and r.get('done_reason')!='length'};Path('work/request-context-benchmark.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
