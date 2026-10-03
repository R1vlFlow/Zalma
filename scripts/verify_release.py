#!/usr/bin/env python3
from pathlib import Path
import json, subprocess, sys, re

root=Path(__file__).resolve().parents[1]
required=[
    Path('.github/workflows/sync-official-schedules.yml'),
    Path('scripts/build_official_schedule.py'), Path('scripts/validate_generated_index.py'), Path('scripts/verify_workflow_contract.py'),
    Path('scripts/test_schedule_parser.py'), Path('scripts/validate_generated_index.py'), Path('scripts/test_ci_consistency.py'), Path('scripts/run_regression_suite.py'), Path('data/ci-regression-contract.json'), Path('scripts/validate_schedule_data.py'), Path('scripts/deep_schedule_audit.py'), Path('scripts/test_matrix_geometry_regression.py'),
    Path('data/official-schedules.json'),
    Path('data/official-sync-status.json'),
    Path('index.html'), Path('sw.js'), Path('UI_VERSION.txt'), Path('requirements-official-sync.txt'), Path('package.json')
]
missing=[str(p) for p in required if not (root/p).exists()]
if missing: raise SystemExit('RELEASE CHECK FAILED: missing '+', '.join(missing))

pkg=json.loads((root/'package.json').read_text(encoding='utf-8'))
assert pkg.get('version')=='4.3.0-pre5', pkg.get('version')

d=json.loads((root/'data/official-schedules.json').read_text(encoding='utf-8'))
assert d.get('schemaVersion')==7
assert set(d.get('courses',{}))==set(map(str,range(1,7)))
for cid in map(str,range(1,7)):
    c=d['courses'][cid]
    assert isinstance(c.get('groups'),list)
    assert isinstance(c.get('streams'),dict)
    assert isinstance(c.get('events'),list)
    if cid in {'1','2','3','4','5'}:
        assert set(c.get('streams',{})) >= {'A','B'}
    else:
        assert '' in c.get('streams',{})
assert d.get('bootstrapNote')

wf=(root/'.github/workflows/sync-official-schedules.yml').read_text(encoding='utf-8')
for needle in ('workflow_dispatch:', 'schedule:', 'permissions:', 'contents: write', 'scripts/test_schedule_parser.py', 'scripts/build_official_schedule.py', 'scripts/validate_generated_index.py'):
    assert needle in wf, needle
assert 'data/official-schedules.json' in wf
assert "cron: '*/30 * * * *'" in wf

idx=(root/'index.html').read_text(encoding='utf-8')
assert 'official-schedules.json' in idx
assert 'schemaVersion)!==7' in idx
sw=(root/'sw.js').read_text(encoding='utf-8')
assert 'almazov-student-ui-prerelease-2.0-cache2' in sw

# Parser compilation and regression suite.
subprocess.run([sys.executable,'-m','py_compile','scripts/build_official_schedule.py','scripts/test_schedule_parser.py'],cwd=root,check=True)
subprocess.run([sys.executable,'scripts/verify_workflow_contract.py'],cwd=root,check=True)
subprocess.run([sys.executable,'scripts/test_schedule_parser.py'],cwd=root,check=True)
subprocess.run([sys.executable,'scripts/test_matrix_geometry_regression.py'],cwd=root,check=True)
subprocess.run([sys.executable,'scripts/test_ci_consistency.py'],cwd=root,check=True)

# Front-end inline JavaScript syntax check when Node is available.
import shutil
if shutil.which('node'):
    import re
    scripts=re.findall(r'<script(?:[^>]*)>(.*?)</script>',idx,re.S|re.I)
    for i,script in enumerate(scripts):
        tmp=root/f'.verify-script-{i}.js'; tmp.write_text(script,encoding='utf-8')
        try: subprocess.run(['node','--check',str(tmp)],cwd=root,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        finally: tmp.unlink(missing_ok=True)

index_text = Path('index.html').read_text(encoding='utf-8')
if 'R1vlFlow/Almazov_Student_beta/main/data/official-schedules.json' in index_text:
    raise SystemExit('RELEASE CHECK FAILED: stale raw GitHub schedule fallback still points to Almazov_Student_beta')
print('RELEASE CHECK: OK')
print('Engine version: 4.3.0-pre5')
print('UI version: PRE-RELEASE 2.0')
print('Workflow: present')
print('Parser regression: OK')
print('Frontend JavaScript syntax: OK')
