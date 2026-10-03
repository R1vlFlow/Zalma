#!/usr/bin/env python3
"""Final PRE-RELEASE 2.0 client/runtime contract checks."""
from pathlib import Path
import json
import re

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
DATA=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))
VERSION=json.loads((ROOT/'version.json').read_text(encoding='utf-8'))
README=(ROOT/'README_FIRST.md').read_text(encoding='utf-8')
checks=[]
def check(name,ok): checks.append((name,bool(ok)))

check('viewport contract', 'width=device-width,initial-scale=1,viewport-fit=cover' in HTML)
check('supported course selector 1-6', '[1,2,3,4,5,6]' in HTML)
check('premium touch portal active', '.as-select-menu.as-select-portal.portal-open' in HTML and 'pointer-events:auto!important' in HTML)
check('no coarse-pointer portal disable', '.as-select-menu.as-select-portal{display:none!important' not in HTML)
check('touch selection handler', "menu.addEventListener('pointerdown'" in HTML and "menu.addEventListener('touchend'" in HTML)
check('responsive breakpoints present', all(x in HTML for x in ['@media(max-width:1100px)','@media(max-width:720px)','@media(max-width:650px)']))
check('safe area support', 'env(safe-area-inset-bottom)' in HTML)
check('dynamic viewport support', '100dvh' in HTML or '100svh' in HTML or '100lvh' in HTML)
check('course-scoped health gate', 'const ids=courseId!=null?[String(courseId)]' in HTML)
check('partial bootstrap accepted by client', 'Полнота live-расписания 1–6 курсов проверяется отдельно CI' in README and 'if(!events.length)return false;' in HTML)
check('all six course rosters exist', all(str(i) in DATA.get('courses',{}) and DATA['courses'][str(i)].get('groups') for i in range(1,7)))
check('all six courses have bootstrap events', all(DATA['courses'][str(i)].get('events') for i in range(1,7)))
check('bootstrap index is transfer-optimized', (ROOT/'data/official-schedules.json').stat().st_size < 1400000)
check('current raw GitHub fallback', 'https://raw.githubusercontent.com/R1vlFlow/Zalma/main/data/official-schedules.json' in HTML)
check('current release metadata', VERSION.get('version')=='4.3.0-pre5' and VERSION.get('title')=='Almazov Student — PRE-RELEASE 2.0')
check('no stale README engine version', '4.3.0-pre2' not in README and 'Almazov_Test' not in README)
check('no stale APK repository in sync fallback', 'Almazov_Student_beta/main/data/official-schedules.json' not in HTML)

failed=[n for n,o in checks if not o]
print(f'PRE-RELEASE 2.0 FINAL CONTRACT: {len(checks)-len(failed)}/{len(checks)} passed')
if failed:
    print('FAILED:')
    for n in failed: print(' -',n)
    raise SystemExit(1)
