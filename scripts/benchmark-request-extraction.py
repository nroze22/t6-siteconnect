from structured_wire import normalize_wire
from pathlib import Path
import json,time,urllib.request,statistics
ROOT=Path(__file__).resolve().parents[1];profile=json.loads((ROOT/'src/lib/extraction/request-profile.json').read_text());cases=[c for c in json.loads((ROOT/'sample-data/extraction/benchmark-cases.json').read_text()) if c['id'] in ['lab-pair','missing-unit','comparator','empty']];out=ROOT/'work/request-benchmark.json';results=[]
for c in cases:
 if c['id']=='comparator':c['expected'].append({'kind':'context','label':'final','value':'final','unit':None,'assertion':'present'})
for case in cases:
 body={'model':'gemma4:e2b','stream':False,'think':profile.get('think',False),'keep_alive':profile['keep_alive'],'options':profile['options'],'format':profile['schema'],'messages':[{'role':'system','content':profile['system']+'\nRequired JSON schema: '+json.dumps(profile['schema'],separators=(',',':'))+'\nRequest: '+(ROOT/'src/lib/data-counts/request.json').read_text()},{'role':'user','content':json.dumps(case['segments'],separators=(',',':'))}]}
 start=time.monotonic();attempts=1
 try:
  request=urllib.request.Request('http://127.0.0.1:11434/api/chat',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(request,timeout=180) as r:response=json.load(r)
  wire=json.loads(response['message']['content']);parsed=normalize_wire(wire);entities=parsed['entities']
  errors=[]
  for i,e in enumerate(entities):
   source=next((s['text'] for s in case['segments'] if s['id']==e['segment_id']),'');q=e.get('quote','')
   if not q or source.count(q)!=1:errors.append(f'Entity {i}: quote is not a unique exact source passage')
   for key in ['label','value','unit','subject']:
    if e.get(key) is not None and e[key] not in q:errors.append(f'Entity {i}: {key} does not occur exactly in quote')
   if e.get('kind')=='diagnosis' and e.get('value')!=e.get('label'):errors.append(f'Entity {i}: diagnosis value must be identical to condition label')
  if errors:
   body['messages'] += [{'role':'assistant','content':json.dumps(wire,separators=(',',':'))},{'role':'user','content':profile['repair_instruction']+json.dumps(errors,separators=(',',':'))}]
   request=urllib.request.Request('http://127.0.0.1:11434/api/chat',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
   with urllib.request.urlopen(request,timeout=180) as r:response=json.load(r)
   wire=json.loads(response['message']['content']);parsed=normalize_wire(wire);entities=parsed['entities'];attempts=2
  supported=[]
  for e in entities:
   source=next((s['text'] for s in case['segments'] if s['id']==e['segment_id']),'');quote=e.get('quote','')
   grounded=bool(quote) and source.count(quote)==1 and all(e.get(k) is None or e[k] in quote for k in ['label','value','unit','subject'])
   supported.append(grounded)
  matched=[]
  for expected in case['expected']:
   matched.append(any(g and e['kind']==expected['kind'] and (expected['kind']=='context' or e['label'].lower()==expected['label'].lower()) and e['value']==expected['value'] and e['unit']==expected['unit'] and e['assertion']==expected['assertion'] for e,g in zip(entities,supported)))
  passed=all(matched) and len(entities)==len(case['expected']) and all(supported) and all(e.get('field') in (['Observation.valueQuantity']+profile['schema']['properties']['entities']['items']['anyOf'][1]['properties']['field']['enum']) for e in entities) and response.get('done') and response.get('done_reason')!='length'
  row={'case':case['id'],'attempts':attempts,'seconds':round(time.monotonic()-start,2),'passed':passed,'matched':sum(matched),'expected':len(matched),'returned':len(entities),'grounded':sum(supported),'done_reason':response.get('done_reason'),'entities':entities,'prompt_tokens':response.get('prompt_eval_count'),'output_tokens':response.get('eval_count')}
 except Exception as e:row={'case':case['id'],'attempts':attempts,'seconds':round(time.monotonic()-start,2),'passed':False,'error':str(e)}
 results.append(row);print(json.dumps(row),flush=True);out.parent.mkdir(exist_ok=True);out.write_text(json.dumps({'model':body['model'],'profile':profile,'scope':'Four request-focused synthetic cases; exact field/assertion and verbatim evidence checks. Not clinical validation.','runs':results},indent=2))
print('Cases passed',sum(r['passed'] for r in results),'/',len(results),'median seconds',statistics.median(r['seconds'] for r in results),flush=True)
