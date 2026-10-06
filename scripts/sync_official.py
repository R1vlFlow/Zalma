#!/usr/bin/env python3
"""Server-side sync for GitHub Actions.

Copies the current LD index when available, refreshes source timestamps and
leaves manually curated Pедиатрия/КП adapters intact until they are reviewed.
The important invariant is: failed/partial sync never replaces a known-good
snapshot.
"""
import json, urllib.request, urllib.error, tempfile, shutil, re
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/live-index.json'
URL='https://raw.githubusercontent.com/R1vlFlow/Zalma/main/data/official-schedules.json'

def validate_payload(data):
    if data.get('schemaVersion')!=7 or not isinstance(data.get('courses'),dict):
        raise ValueError('unexpected official index schema')
    courses=data['courses']
    for course,c in courses.items():
        if not isinstance(c,dict) or not isinstance(c.get('groups'),list) or not isinstance(c.get('events'),list):
            raise ValueError(f'course {course}: missing groups/events arrays')
        group_set={str(g).strip() for g in c['groups']}
        stream_registry={}
        for stream, raw_groups in (c.get('streams') or {}).items():
            rg=raw_groups if isinstance(raw_groups,list) else (raw_groups.get('groups',[]) if isinstance(raw_groups,dict) else [])
            for g in rg:
                token=str(g).strip()
                if token not in group_set: raise ValueError(f'course {course}: stream {stream} references unknown group {token}')
                old=stream_registry.get(token)
                if old and old!=stream: raise ValueError(f'course {course}: group {token} belongs to streams {old} and {stream}')
                stream_registry[token]=stream
        seen=set()
        for e in c['events']:
            groups=e.get('groups') if isinstance(e.get('groups'),list) else ([e.get('group') or e.get('groupName')] if (e.get('group') or e.get('groupName')) else [])
            for g in groups:
                if str(g).strip() not in group_set and str(g).strip().upper() not in ('ALL','*'):
                    raise ValueError(f'course {course}: event references unknown group {g}')
            date=str(e.get('date',''))
            start=str(e.get('start','')); end=str(e.get('end',''))
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',date): raise ValueError(f'course {course}: invalid event date')
            if not re.fullmatch(r'\d{2}:\d{2}',start) or not re.fullmatch(r'\d{2}:\d{2}',end): raise ValueError(f'course {course}: invalid event time')
            typ=str(e.get('type') or e.get('lessonType') or '').strip().lower()
            if typ and not (('лекц' in typ) or ('практик' in typ) or ('семинар' in typ) or typ in ('lecture','lect','practice','пз','seminar')):
                raise ValueError(f'course {course}: unknown lesson type {typ}')
            stream=str(e.get('stream') or e.get('streamCode') or e.get('flow') or '').strip().upper().replace(' ','')
            if stream and stream_registry:
                stream=stream.replace('Б','B').replace('А','A').removeprefix('ПОТОК').removeprefix('STREAM').removeprefix('FLOW')
            if stream and groups:
                for g in groups:
                    token=str(g).strip()
                    if token in stream_registry and stream_registry[token] != str(stream):
                        raise ValueError(f'course {course}: event stream mismatch for group {token}')
            semantic=(date,start,end,str(e.get('subject','')).strip().lower(),str(e.get('location','')).strip().lower(),str(e.get('type') or e.get('lessonType') or '').strip().lower(),str(e.get('doubleIndex') or e.get('split') or ''))
            if semantic in seen: raise ValueError(f'course {course}: duplicate semantic event')
            seen.add(semantic)

req=urllib.request.Request(URL, headers={'User-Agent':'Almazov-Universal-Schedule-Sync/1.1'})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        payload=json.load(r)
    validate_payload(payload)
    tmp=OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
    tmp.replace(OUT)
    print(f'saved {OUT} generatedAt={payload.get("generatedAt")}')
except Exception as e:
    print(f'official index sync failed: {e}')
    if OUT.exists(): print('keeping existing live-index.json')
    else: raise
