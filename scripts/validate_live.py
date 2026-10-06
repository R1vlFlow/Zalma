import json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'data/live-index.json'
if not p.exists():
    print('NO LIVE SNAPSHOT: data/live-index.json is not present yet; sync step must create it.')
    sys.exit(0)
try:
    data=json.loads(p.read_text(encoding='utf-8'))
except Exception as e:
    print(f'ERROR invalid JSON: {e}'); sys.exit(1)
if int(data.get('schemaVersion',0)) != 7:
    print(f'ERROR unsupported schemaVersion={data.get("schemaVersion")}'); sys.exit(1)
def norm_stream(v):
    s=str(v or '').strip().upper().replace(' ','').replace('Б','B').replace('А','A')
    for prefix in ('ПОТОК','STREAM','FLOW'):
        if s.startswith(prefix): s=s[len(prefix):]
    return re.sub(r'[^A-Z0-9А-ЯЁ]','',s)

errs=[]; total=0; groups=0; courses=data.get('courses') or {}
for course,c in courses.items():
    if not isinstance(c,dict): errs.append(f'course {course} is not object'); continue
    gs=[str(x) for x in c.get('groups',[])]; groups += len(gs)
    streams=c.get('streams') or {}
    stream_seen={}
    for stream, raw_groups in streams.items():
        rg=raw_groups if isinstance(raw_groups,list) else (raw_groups.get('groups',[]) if isinstance(raw_groups,dict) else [])
        for g in map(str,rg):
            if g in stream_seen and stream_seen[g]!=stream: errs.append(f'course {course}: group {g} belongs to streams {stream_seen[g]} and {stream}')
            stream_seen[g]=stream
            if g not in gs: errs.append(f'course {course}: stream {stream} references unknown group {g}')
    seen=set()
    for e in c.get('events',[]):
        total += 1
        candidates=[str(x) for x in e.get('groups',[])] if isinstance(e.get('groups'),list) else [str(e.get('group') or e.get('groupName') or '')]
        if candidates and not any(x in gs or x in ('ALL','*') for x in candidates):
            errs.append(f'course {course}: event references unknown group(s) {candidates}')
        if not re.match(r'^\d{4}-\d{2}-\d{2}$',str(e.get('date',''))):
            errs.append(f'course {course}: event without valid date: {e.get("id") or e.get("subject")}')
        if not re.match(r'^\d{2}:\d{2}$',str(e.get('start',''))): errs.append(f'course {course}: bad start')
        if not re.match(r'^\d{2}:\d{2}$',str(e.get('end',''))): errs.append(f'course {course}: bad end')
        event_stream=norm_stream(e.get('stream') or e.get('streamCode') or e.get('flow') or '')
        if event_stream and stream_seen and candidates and any(x in ('ALL','*','') for x in candidates):
            if event_stream not in {norm_stream(k) for k in streams.keys()}: errs.append(f'course {course}: event has unknown stream {event_stream}')
        if event_stream and candidates and not any(x in ('ALL','*','') for x in candidates):
            for g in candidates:
                if g in stream_seen and norm_stream(stream_seen[g])!=event_stream: errs.append(f'course {course}: event group {g} declares stream {event_stream}, registry says {stream_seen[g]}')
        key=(str(e.get('date','')),str(e.get('start','')),str(e.get('end','')),str(e.get('subject','')).strip().lower(),str(e.get('location','')).strip().lower(),str(e.get('group') or e.get('groupName') or ''),str(e.get('groups','')),str(e.get('doubleIndex') or ''))
        if key in seen: errs.append(f'course {course}: duplicate semantic event {key}')
        seen.add(key)
if errs:
    print('ERRORS:'); print('\n'.join(errs[:100])); sys.exit(1)
print(f'OK live schema v7 · courses={len(courses)} · groups={groups} · events={total}')
