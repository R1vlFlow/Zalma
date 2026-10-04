#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WF = ROOT / '.github' / 'workflows' / 'sync-official-schedules.yml'
if not WF.exists(): raise SystemExit('WORKFLOW CONTRACT FAILED: canonical workflow is missing')
text = WF.read_text(encoding='utf-8')
required = [
    'workflow_dispatch:', 'schedule:', 'permissions:', 'contents: write',
    'scripts/build_official_schedule.py', 'scripts/validate_generated_index.py',
    'scripts/validate_schedule_data.py', 'scripts/validate_js.py',
    'actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4'
]
for needle in required:
    if needle not in text: raise SystemExit(f'WORKFLOW CONTRACT FAILED: missing {needle!r}')
if 'scripts/sync_official.py' in text and 'scripts/build_official_schedule.py' not in text:
    raise SystemExit('WORKFLOW CONTRACT FAILED: stale sync entrypoint')
print('WORKFLOW CONTRACT: OK')
