#!/usr/bin/env python3
"""Single local release gate for the GitHub-ready repository."""
from pathlib import Path
import json, re, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
required = [
    'public/index.html','public/offline.html','404.html','README_FIRST.md','PRIVACY.md','COPYRIGHT.md',
    'logo.png','manifest.webmanifest','sw.js','version.json','package.json',
    'requirements-official-sync.txt','SCHEDULE_ENGINE_VERSION.txt','UI_VERSION.txt',
    'data/official-schedules.json','data/official-sync-status.json',
    '.github/workflows/sync-official-schedules.yml',
    'scripts/build_official_schedule.py','scripts/sync_official.py',
    'scripts/validate_generated_index.py','scripts/validate_schedule_data.py',
    'scripts/validate_js.py','scripts/verify_workflow_contract.py'
]
missing=[p for p in required if not (ROOT/p).exists()]
if missing: raise SystemExit('RELEASE CHECK FAILED: missing '+', '.join(missing))

pkg=json.loads((ROOT/'package.json').read_text())
assert re.fullmatch(r'\d+\.\d+\.\d+-rc\.\d+', str(pkg.get('version',''))), pkg.get('version')
data=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))
assert data.get('schemaVersion')==7
after=data.get('dataState')
assert after in {None,'live-generated','local-recovery-snapshot'}, after
assert set(data.get('courses',{}))==set('123456')
for cid,c in data['courses'].items():
    assert c.get('groups') and c.get('streams') and c.get('events')
    assert set(sum(c['streams'].values(),[]))==set(c['groups'])
    assert any(e.get('type')=='lecture' for e in c['events'])
    assert any(e.get('type')=='practice' for e in c['events'])
idx=(ROOT/'public/index.html').read_text(encoding='utf-8')
for token in ['main.js','Расписание']: assert token in idx, token

assert 'document.cookie' not in idx
subprocess.run([sys.executable,'scripts/verify_workflow_contract.py'],cwd=ROOT,check=True)
subprocess.run([sys.executable,'scripts/validate_js.py'],cwd=ROOT,check=True)
subprocess.run([sys.executable,'scripts/validate_release.py'],cwd=ROOT,check=True)
subprocess.run([sys.executable,'scripts/validate_schedule_data.py'],cwd=ROOT,check=True)
subprocess.run([sys.executable,'scripts/validate_generated_index.py'],cwd=ROOT,check=True)
print('RELEASE CHECK: OK — local schedule recovery + live sync contract are consistent')
