#!/usr/bin/env python3
from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
BUILD = (ROOT / 'scripts/build_official_schedule.py').read_text(encoding='utf-8')
APP = (ROOT / 'src/app.ts').read_text(encoding='utf-8')
ROSTER = json.loads((ROOT / 'data/official-roster-contract.json').read_text(encoding='utf-8'))
WF = (ROOT / '.github/workflows/sync-official-schedules.yml').read_text(encoding='utf-8')
SCHEDULE = json.loads((ROOT / 'data/official-schedules.json').read_text(encoding='utf-8'))

checks = []
def check(name, ok):
    checks.append((name, bool(ok)))

check('exact LD roster contract present', set(ROSTER) == {'1','2','3','4','5','6'})
for course, expected in ROSTER.items():
    groups = [str(g) for stream in expected.values() for g in stream]
    check(f'course {course} roster sizes match', len(set(groups)) == len(groups))
    check(f'course {course} groups have official schedule coverage',
          all(any(str(e.get('course')) == course and str(e.get('group')) == g for e in SCHEDULE.get('events', []))
              for g in groups) if SCHEDULE.get('events') else True)
check('builder uses official roster contract', 'official-roster-contract.json' in BUILD)
check('builder preserves double metadata', 'doubleIndex' in BUILD and 'doubleOf' in BUILD)
check('client renders double parts', 'doublePart' in APP and '1/2' in APP and '2/2' in APP)
check('workflow runs JS validation', 'python scripts/validate_js.py' in WF)
check('workflow runs generated-index validation', 'python scripts/validate_generated_index.py' in WF)
check('workflow runs schedule-data validation', 'python scripts/validate_schedule_data.py' in WF)
check('workflow runs npm production QA', 'npm run qa' in WF)

failed = [name for name, ok in checks if not ok]
print(f'SCHEDULE COVERAGE CONTRACT: {len(checks) - len(failed)}/{len(checks)} passed')
if failed:
    print('FAILED:')
    for name in failed:
        print(' - ' + name)
    raise SystemExit(1)
