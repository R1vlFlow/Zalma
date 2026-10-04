#!/usr/bin/env python3
import json,re,sys
from pathlib import Path
root=Path('.')
errors=[]
required=['index.html','offline.html','404.html','README_FIRST.md','PRIVACY.md','COPYRIGHT.md','logo.png','manifest.webmanifest','sw.js','version.json','data/official-schedules.json','.github/workflows/sync-official-schedules.yml','scripts/sync_official.py','scripts/validate_js.py','scripts/validate_release.py']
for p in required:
    if not (root/p).exists(): errors.append(f'missing {p}')
try:
 d=json.loads((root/'data/official-schedules.json').read_text())
 if d.get('schemaVersion')!=7:errors.append('wrong schemaVersion')
 for c in '123456':
  x=d['courses'][c]
  if not x.get('groups') or not x.get('streams'):errors.append(f'course {c} roster missing')
  if any(g not in x['groups'] for gs in x['streams'].values() for g in gs):errors.append(f'course {c} stream/group mismatch')
except Exception as e: errors.append(f'bad schedule json: {e}')
s=(root/'index.html').read_text(errors='ignore')
for token in ['DEFAULT_SCHEDULE','normalizeData','renderSchedule','expandClientDoubleEvents','OFFICIAL_INDEX_URLS','localStorage']:
 if token not in s: errors.append(f'index missing {token}')
if 'document.cookie' in s: errors.append('cookie API must not be used')
if 'const DEFAULT_SCHEDULE=' not in s: errors.append('embedded schedule fallback missing')
if errors:
 print('\n'.join('ERROR: '+e for e in errors));sys.exit(1)
print('release contract: PASS')
