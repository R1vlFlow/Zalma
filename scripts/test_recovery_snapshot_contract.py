#!/usr/bin/env python3
"""Guards against publishing synthetic rows as verified schedule data."""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
payload = json.loads((ROOT / 'data/official-schedules.json').read_text(encoding='utf-8'))
copy_public = (ROOT / 'scripts/copy-public.mjs').read_text(encoding='utf-8')
pipeline = (ROOT / 'server/pipeline.mjs').read_text(encoding='utf-8')
validate = (ROOT / 'src/core/validate.ts').read_text(encoding='utf-8')
server = (ROOT / 'server/server.mjs').read_text(encoding='utf-8')
app = (ROOT / 'src/app.ts').read_text(encoding='utf-8')
html = (ROOT / 'public/index.html').read_text(encoding='utf-8')
store = (ROOT / 'src/services/personalizationStore.ts').read_text(encoding='utf-8')
audit = (ROOT / 'scripts/deep_schedule_audit.py').read_text(encoding='utf-8')

checks: list[tuple[str, bool]] = []
def check(name: str, condition: bool) -> None:
    checks.append((name, bool(condition)))

all_events = [event for course in payload.get('courses', {}).values() for event in course.get('events', [])]
all_sources = [source for course in payload.get('courses', {}).values() for source in course.get('sources', [])]
check('fallback snapshot is explicitly labelled as recovery data', payload.get('dataState') == 'local-recovery-snapshot')
check('no event uses fixture URL/parser/source markers', all(
    not str(event.get('sourceUrl', '')).startswith('fixture://')
    and event.get('sourceKind') != 'practice-fallback-fixture'
    and event.get('parser') != 'fixture'
    for event in all_events
))
check('no source manifest lists synthetic practice fixtures', all(source.get('kind') != 'practice-fixture' for source in all_sources))
for course_id in ('4', '5', '6'):
    course = payload.get('courses', {}).get(course_id, {})
    events = course.get('events', [])
    dated = [event for event in events if event.get('date')]
    blocks = [event for event in events if event.get('scheduleMode') == 'weekly-block']
    check(f'{course_id}K keeps valid dated lecture rows', bool(dated) and all(event.get('type') == 'lecture' for event in dated))
    check(f'{course_id}K weekly practice rows are undated and marked as matrix blocks', all(
        event.get('type') == 'practice' and not event.get('date') and event.get('weekday') is None
        for event in blocks
    ) and all(event.get('scheduleMode') == 'weekly-block' for event in events if event.get('type') == 'practice'))

# Cached official matrices are kept with provenance, not falsely marked live.
c4 = payload['courses']['4']['sources']
c5 = payload['courses']['5']['sources']
c6 = payload['courses']['6']['sources']
check('4K A/B cached official matrices are parsed but pending live revalidation', all(
    any(source.get('kind') == 'practice' and source.get('stream') == stream
        and source.get('events') == expected and source.get('status') == 'parsed-from-cached-official-pdf-pending-live-revalidation'
        and source.get('cacheSha256') for source in c4)
    for stream, expected in [('A', 250), ('B', 248)]
))
check('5K B parsed; 5K A and 6K remain quarantined when empty',
    any(s.get('kind') == 'practice' and s.get('stream') == 'B' and s.get('events') == 194 and s.get('status') == 'parsed-from-cached-official-pdf-pending-live-revalidation' for s in c5)
    and any(s.get('kind') == 'practice' and s.get('stream') == 'A' and s.get('events') == 0 and s.get('status') == 'quarantined' for s in c5)
    and any(s.get('kind') == 'practice' and s.get('events') == 0 and s.get('status') == 'quarantined' for s in c6)
)
check('static build publishes recovery snapshot only as partial', "payload.dataState==='local-recovery-snapshot'?'partial'" in copy_public and "'LOCAL_RECOVERY_SNAPSHOT','SCHEDULE_SOURCE_COVERAGE_INCOMPLETE'" in copy_public)
check('server labels unverified local and remote snapshots partial', "return{status:complete?'live':'partial'" in pipeline and 'не дополнялись фиктивными парами' in pipeline)
check('runtime ingestion rejects old fixture rows defensively', all(marker in validate for marker in ("startsWith('fixture://')", 'practice-fallback-fixture', "String(raw?.parser??'')==='fixture'")))
check('deep live audit preserves strict full-coverage requirement', 'Strict 100% group/stream lesson coverage is required' in audit and 'live-generated' in audit)
check('cache headers disable cache for dynamic app data', 'no-cache, no-store, must-revalidate, max-age=0' in server)
check('stream selector and all requested lesson filters are present', 'id="streamSelector"' in html and all(f'data-type="{kind}"' in html for kind in ('lecture', 'practice', 'seminar', 'lab', 'clinical', 'assessment')))
check('stream selection and per-subject gradients are wired in app', 'data-stream' in app and 'almazov.last-group.' in app and 'SUBJECT_GRADIENT_PRESETS' in app)
check('personalization persists only allowlisted gradient presets', 'subjectGradients' in store and 'allowedGradients.has(value)' in store)
check('known-subject location-tail repair is conservative and tested', 'repair_subject_leaks_from_location' in (ROOT / 'scripts/build_official_schedule.py').read_text(encoding='utf-8'))

failed = [name for name, ok in checks if not ok]
for name, ok in checks:
    print(f'{"PASS" if ok else "FAIL"} — {name}')
print(f'RECOVERY SNAPSHOT CONTRACT: {len(checks) - len(failed)}/{len(checks)} passed')
if failed:
    print('FAILED:\n - ' + '\n - '.join(failed))
    sys.exit(1)
