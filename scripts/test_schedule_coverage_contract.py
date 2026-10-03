#!/usr/bin/env python3
from pathlib import Path
import json,re,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
BUILD=(ROOT/'scripts/build_official_schedule.py').read_text(encoding='utf-8')
UNIVERSAL=(ROOT/'scripts/universal_schedule_parser.py').read_text(encoding='utf-8')
ROSTERS=(ROOT/'data/official-roster-contract.json').read_text(encoding='utf-8')
WF=(ROOT/'.github/workflows/sync-official-schedules.yml').read_text(encoding='utf-8')
PKG=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
checks=[]
def check(name,ok):
    checks.append((name,bool(ok)))
check('universal parser module present', 'class UniversalScheduleParser' in UNIVERSAL and 'weekly-matrix' in UNIVERSAL)
check('roster contract separated from parser', 'EXPECTED_ROSTERS=' not in BUILD and 'official-roster-contract.json' in BUILD and '4' in ROSTERS and '5' in ROSTERS)
check('parser validates every expected group', 'no practice events for groups' in BUILD)
check('workflow every 30 minutes', "cron: '*/30 * * * *'" in WF)
check('workflow runs canonical regression suite', 'python scripts/run_regression_suite.py' in WF and (ROOT/'data/ci-regression-contract.json').exists())
check('client every 30 minutes', bool(re.search(r'setInterval\(\(\)=>autoSyncOfficialSchedule\(true\),30\*60\*1000\)', HTML)))
check('weekly-block UI', 'Занятия на учебной неделе без указанного дня' in HTML)
check('healthy index checks every published roster group', 'listed.some(g=>!events.some' in HTML)
check('same-origin index is primary with raw recovery', 'Same-origin schedule index is authoritative' in HTML and 'raw GitHub is a recovery path' in HTML)
check('bootstrap state is explicit', json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8')).get('dataState')=='bootstrap-pending')
check('builder emits live-generated state', "'dataState':'live-generated'" in BUILD)
check('atomic generated index', "tmp=OUT.with_suffix('.json.tmp')" in BUILD and 'tmp.replace(OUT)' in BUILD)
failed=[n for n,ok in checks if not ok]
print(f'SCHEDULE COVERAGE CONTRACT: {len(checks)-len(failed)}/{len(checks)} passed')
if failed:
    print('FAILED:'); [print(' - '+x) for x in failed]; raise SystemExit(1)
