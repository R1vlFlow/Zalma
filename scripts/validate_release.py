#!/usr/bin/env python3
import json, re, sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
errors=[]
required=[
    'public/index.html','public/styles.css','public/boot.js','public/sw.js','public/manifest.webmanifest',
    'src/main.ts','src/app.ts','src/core/types.ts','src/core/normalize.ts','src/core/filter.ts',
    'src/data/catalog.ts','src/data/roster.ts','server/server.mjs','server/pipeline.mjs',
    'data/official-schedules.json','data/official-roster-contract.json','version.json','package.json',
    '.github/workflows/pages.yml','.github/workflows/qa.yml','.github/workflows/sync-official-schedules.yml'
]
for rel in required:
    if not (ROOT/rel).exists(): errors.append(f'missing {rel}')

try:
    pkg=json.loads((ROOT/'package.json').read_text())
    version=json.loads((ROOT/'version.json').read_text())
    if pkg.get('version') != version.get('version'): errors.append('package.json/version.json version mismatch')
    if not str(pkg.get('version','')).endswith('-rc.1'): errors.append(f"release candidate version expected: {pkg.get('version')}")
except Exception as exc: errors.append(f'bad release metadata: {exc}')

try:
    data=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf8'))
    if data.get('schemaVersion')!=7: errors.append('wrong official schedule schemaVersion')
    for course in '123456':
        item=data['courses'][course]
        if not item.get('groups'): errors.append(f'course {course}: empty groups')
        if not item.get('events'): errors.append(f'course {course}: empty events')
        stream_groups={str(g) for gs in (item.get('streams') or {}).values() for g in gs}
        if stream_groups != set(map(str,item.get('groups',[]))): errors.append(f'course {course}: roster/stream mismatch')
except Exception as exc: errors.append(f'bad official schedule data: {exc}')

html=(ROOT/'public/index.html').read_text(encoding='utf8') if (ROOT/'public/index.html').exists() else ''
ids=re.findall(r'id=["\']([^"\']+)',html)
if len(ids)!=len(set(ids)): errors.append('duplicate public HTML ids')
if 'document.cookie' in html: errors.append('document.cookie is forbidden')
for x in ['main.js','styles.css','boot.js','Расписание','data-page="home"','data-page="schedule"']:
    if x not in html: errors.append(f'public HTML missing runtime contract: {x}')

if errors:
    print('\n'.join('ERROR: '+e for e in errors)); sys.exit(1)
print('release contract: PASS')
