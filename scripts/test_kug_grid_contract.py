from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'public/index.html').read_text(encoding='utf-8')
APP=(ROOT/'src/app.ts').read_text(encoding='utf-8')
BUILDER=(ROOT/'scripts/copy-public.mjs').read_text(encoding='utf-8')
DATA=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))
DIST=ROOT/'dist/data/kug.json'
checks=[
 ('canonical SPA has KUG data targets', all(x in HTML for x in ('id="kugDataStatus"','id="kugPeriods"','id="kugSources"'))),
 ('builder exports original official KUG data', "payload.kugSources" in BUILDER and "payload.assessmentPeriods" in BUILDER and "data','kug.json" in BUILDER),
 ('client reads the built KUG JSON', "fetch('./data/kug.json'" in APP and 'function loadKugData()' in APP),
 ('UI renders date-ranged periods and source links', 'function renderKug()' in APP and 'x.sourceUrl' in APP and 'x.start' in APP and 'x.end' in APP),
 ('pending sources remain visibly pending', 'source-linked-pending-sync' in APP and 'данные ожидают синхронизации' in APP),
 ('source periods carry source URLs', isinstance(DATA.get('assessmentPeriods'), list) and all(x.get('sourceUrl') for x in DATA.get('assessmentPeriods',[]))),
 ('generated KUG payload exists in dist', DIST.is_file()),
]
if DIST.is_file():
    built=json.loads(DIST.read_text(encoding='utf-8'))
    checks.append(('built KUG payload matches canonical source counts',len(built.get('sources',[]))==len(DATA.get('kugSources',[])) and len(built.get('periods',[]))==len(DATA.get('assessmentPeriods',[]))))
for name,ok in checks:
    print(('PASS' if ok else 'FAIL')+' — '+name)
failed=[name for name,ok in checks if not ok]
print(f'KUG DATA CONTRACT: {len(checks)-len(failed)}/{len(checks)} passed')
if failed: raise SystemExit(1)
