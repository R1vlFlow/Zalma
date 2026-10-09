from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'public/index.html').read_text(encoding='utf-8')
APP=(ROOT/'src/app.ts').read_text(encoding='utf-8')
CSS=(ROOT/'public/styles.css').read_text(encoding='utf-8')
BUILDER=(ROOT/'scripts/copy-public.mjs').read_text(encoding='utf-8')
OFFICIAL=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))
CURATED=json.loads((ROOT/'data/kug.json').read_text(encoding='utf-8'))
DIST=ROOT/'dist/data/kug.json'
checks=[
 ('canonical SPA exposes KUG data targets', all(x in HTML for x in ('id="kugDataStatus"','id="kugPeriods"','id="kugSources"'))),
 ('calendar provides regular, KUG and combined modes', all(x in HTML for x in ('data-schedule-mode="regular"','data-schedule-mode="kug"','data-schedule-mode="combined"'))),
 ('builder reads complete canonical KUG file', "readFile(join(root,'data','kug.json')" in BUILDER and 'Object.entries(curatedKug)' in BUILDER),
 ('client reads built KUG JSON with bounded network timeout', "fetch('./data/kug.json'" in APP and 'AbortSignal.timeout(6000)' in APP),
 ('UI renders date-ranged periods and links', 'function renderKug()' in APP and 'function renderKugGrid(dates:string[])' in APP and 'x.sourceUrl' in APP and 'x.start' in APP and 'x.end' in APP),
 ('KUG periods carry a supported shape and valid date range', all(isinstance(items,list) and all(isinstance(x.get('from'),str) and isinstance(x.get('to'),str) and x['from']<=x['to'] for x in items) for courses in CURATED.values() for items in courses.values())),
 ('published assessment periods carry their own source URLs', isinstance(OFFICIAL.get('assessmentPeriods'),list) and all(x.get('sourceUrl') for x in OFFICIAL.get('assessmentPeriods',[]))),
 ('non-LD period sources are not falsely linked to LD-specific PDFs', "program==='31.05.01'" in BUILDER),
 ('KUG overlay styles cover each named period type', all(f'.kug-{k}' in CSS for k in ('study','assessment','practice','vacation','session'))),
 ('built KUG payload exists', DIST.is_file()),
]
if DIST.is_file():
 built=json.loads(DIST.read_text(encoding='utf-8'))
 expected=sum(len(items) for courses in CURATED.values() for items in courses.values())
 for p in OFFICIAL.get('assessmentPeriods',[]):
  candidate=('31.05.01',str(p.get('course')),p.get('start'),p.get('end'))
  exists=any(program=='31.05.01' and str(course)==candidate[1] and item.get('from')==candidate[2] and item.get('to')==candidate[3] for program,courses in CURATED.items() for course,items in courses.items() for item in items)
  if not exists: expected += 1
 checks.append(('built KUG payload matches all curated periods and nonduplicate official assessments',len(built.get('periods',[]))==expected and len(built.get('sources',[]))==sum(len(courses) for courses in CURATED.values())))
 checks.append(('non-LD built periods have no unrelated LD PDF URLs',all(not p.get('sourceUrl') for p in built.get('periods',[]) if p.get('program')!='31.05.01')))
for name,ok in checks:
 print(('PASS' if ok else 'FAIL')+' — '+name)
failed=[name for name,ok in checks if not ok]
print(f'KUG DATA CONTRACT: {len(checks)-len(failed)}/{len(checks)} passed')
if failed: raise SystemExit(1)
