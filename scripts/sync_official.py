#!/usr/bin/env python3
"""Server-side sync for GitHub Actions.

Copies the current LD index when available, refreshes source timestamps and
leaves manually curated Pедиатрия/КП adapters intact until they are reviewed.
The important invariant is: failed/partial sync never replaces a known-good
snapshot.
"""
import json, urllib.request, urllib.error, tempfile, shutil
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data/live-index.json'
URL='https://raw.githubusercontent.com/R1vlFlow/Zalma/main/data/official-schedules.json'

req=urllib.request.Request(URL, headers={'User-Agent':'Almazov-Universal-Schedule-Sync/1.0'})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        payload=json.load(r)
    if payload.get('schemaVersion')!=7 or not isinstance(payload.get('courses'),dict):
        raise ValueError('unexpected official index schema')
    tmp=OUT.with_suffix('.tmp')
    tmp.write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
    tmp.replace(OUT)
    print(f'saved {OUT} generatedAt={payload.get("generatedAt")}')
except Exception as e:
    print(f'official index sync failed: {e}')
    if OUT.exists(): print('keeping existing live-index.json')
    else: raise
