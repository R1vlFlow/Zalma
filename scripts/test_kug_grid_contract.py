from pathlib import Path
import json,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
DATA=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))
checks=[
 ('assessment helper exists','function assessmentEventsForWeek' in HTML),
 ('assessment merge exists','function mergeAssessmentEventsIntoWeeks' in HTML),
 ('grid receives KUG events','const gridEvents=[...filteredEvents,...weekAssessment]' in HTML),
 ('day renderer handles assessment','e.__kind===\'assessment\'' in HTML),
 ('official KUG link rendered','Открыть официальный КУГ' in HTML),
 ('assessmentPeriods present','assessmentPeriods' in DATA),
 ('all current bootstrap KUG periods have source',all(x.get('sourceUrl') for x in DATA.get('assessmentPeriods',[]))),
 ('workflow runs this test',(ROOT/'.github/workflows/sync-official-schedules.yml').read_text(encoding='utf8').find('test_kug_grid_contract.py')>=0),
]
for name,ok in checks:
    if not ok: raise SystemExit('FAIL: '+name)
    print('PASS — '+name)
print(f'KUG GRID CONTRACT: {len(checks)}/{len(checks)} passed')
