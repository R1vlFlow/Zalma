#!/usr/bin/env python3
"""Validate current Pages deployment and scheduled sync workflow contracts."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
pages=(ROOT/'.github/workflows/pages.yml').read_text(encoding='utf-8')
sync=(ROOT/'.github/workflows/sync-official-schedules.yml').read_text(encoding='utf-8')
guide=(ROOT/'README_FIRST.md').read_text(encoding='utf-8')
checks=[
 ('normal deploy handles main/master', bool(re.search(r'branches:\s*\[\s*main,\s*master\s*\]',pages))),
 ('normal deploy supports workflow_dispatch','workflow_dispatch:' in pages),
 ('scheduled sync is manual/scheduled', 'workflow_dispatch:' in sync and 'schedule:' in sync),
 ('sync does not compete on normal pushes', not re.search(r'^\s*push:\s*$',sync,re.M)),
 ('shared deployment queue cannot cancel in-progress release', 'group: pages' in pages and 'group: pages' in sync and 'cancel-in-progress: false' in pages and 'cancel-in-progress: false' in sync),
 ('both workflows deploy dist artifacts', pages.count('path: dist')>=1 and sync.count('path: dist')>=1),
 ('canonical URL instructions avoid /dist/', 'без `/dist/`' in guide),
]
failed=[name for name,ok in checks if not ok]
print(f'CI CONSISTENCY CONTRACT: {len(checks)-len(failed)}/{len(checks)} passed')
for name in failed: print('FAILED: '+name)
if failed: raise SystemExit(1)
