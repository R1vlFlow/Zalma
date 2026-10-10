#!/usr/bin/env python3
"""Structural validation for the generated official schedule index."""
from pathlib import Path
import json, sys, re

ROOT=Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from schedule_validation_common import bootstrap_event_errors, calendar_consistency_errors
DATA=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))
raw_schema=DATA.get('schemaVersion')
try:
    schema=int(raw_schema)
except (TypeError, ValueError):
    raise SystemExit(f'Invalid schemaVersion={raw_schema!r} (type={type(raw_schema).__name__}); expected 7')
if schema != 7:
    raise SystemExit(f'Invalid schemaVersion={raw_schema!r} (type={type(raw_schema).__name__}); expected 7')
# Bootstrap data may defer roster completeness, but its existing events must still
# satisfy the same structural invariants as live-generated events.
bootstrap_errors = bootstrap_event_errors(DATA) + calendar_consistency_errors(DATA)
if bootstrap_errors:
    raise SystemExit('SCHEDULE DATA VALIDATION FAILED — bootstrap/event invariants:\n' + '\n'.join(' - ' + x for x in bootstrap_errors[:100]))

if DATA.get('dataState') == 'bootstrap-pending':
    print('SCHEDULE DATA VALIDATION: OK — bootstrap-pending; strict event validation is deferred to the first live GitHub synchronization.')
    raise SystemExit(0)
if DATA.get('dataState') not in {None, 'live-generated', 'local-recovery-snapshot'}:
    raise SystemExit(f"Unsupported dataState={DATA.get('dataState')!r}")
courses=DATA.get('courses',{})
expected={
 '1': {'A':list(map(str,range(101,123))), 'B':list(map(str,range(123,136)))},
 '2': {'A':list(map(str,range(201,217))), 'B':list(map(str,range(217,230)))},
 '3': {'A':list(map(str,range(301,313))), 'B':list(map(str,range(313,323)))},
 '4': {'A':list(map(str,range(401,413))), 'B':list(map(str,range(413,425)))},
 '5': {'A':list(map(str,range(501,513))), 'B':list(map(str,range(513,523)))},
 '6': {'':list(map(str,range(601,619)))},
}
errors=[]
recovery = DATA.get('dataState') == 'local-recovery-snapshot'
for cid, roster in expected.items():
    c=courses.get(cid,{})
    groups=set(map(str,c.get('groups',[])))
    expected_groups={g for xs in roster.values() for g in xs}
    missing=sorted(expected_groups-groups,key=int); extra=sorted(groups-expected_groups,key=int)
    if missing: errors.append(f'{cid}: missing groups {missing}')
    if extra: errors.append(f'{cid}: unexpected groups {extra}')
    events=c.get('events',[])
    if not events: errors.append(f'{cid}: no events')
    seen=set()
    for e in events:
        if str(e.get('sourceUrl','')).startswith('fixture://') or e.get('sourceKind')=='practice-fallback-fixture':
            errors.append(f'{cid}: fixture-derived event must not be shipped')
        if e.get('type')=='practice' and len(str(e.get('group',''))) != 3:
            errors.append(f"{cid}: practice event without 3-digit group: {e}")
        wd=e.get('weekday')
        if wd is not None and wd not in range(7): errors.append(f'{cid}: invalid weekday {wd}')
        if not re.fullmatch(r'\d{2}:\d{2}',str(e.get('start',''))) or not re.fullmatch(r'\d{2}:\d{2}',str(e.get('end',''))):
            errors.append(f"{cid}: non-canonical event time {e.get('start')}-{e.get('end')}")
        if e.get('weekday') is None and e.get('type')!='practice':
            errors.append(f'{cid}: only practice events may omit weekday')
        if e.get('weekday') is None and e.get('type')=='practice' and e.get('scheduleMode')!='weekly-block' and cid in {'4','5','6'}:
            errors.append(f'{cid}: practice without weekday must be weekly-block')
        key=(e.get('type'),e.get('stream',''),e.get('group'),e.get('weekNumber'),e.get('date'),e.get('weekday'),e.get('start'),e.get('end'),e.get('subject'),e.get('location'))
        if key in seen: errors.append(f'{cid}: exact duplicate event {key}')
        seen.add(key)
    if cid in {'1','2','3','4','5'}:
        for st in ('A','B'):
            if not c.get('streams',{}).get(st): errors.append(f'{cid}: stream {st} has no groups')
            if not recovery and not any(e.get('stream')==st and e.get('type')=='practice' for e in events): errors.append(f'{cid}: stream {st} has no practice events')
            if not any(e.get('stream')==st and e.get('type')=='lecture' for e in events): errors.append(f'{cid}: stream {st} has no lecture events')
    else:
        if not recovery and not any(e.get('type')=='practice' for e in events): errors.append('6: no practice events')

if errors:
    print('SCHEDULE DATA VALIDATION FAILED')
    print('\n'.join(' - '+x for x in errors))
    raise SystemExit(1)
print('SCHEDULE DATA VALIDATION: OK — 1–6 rosters and event shape verified; recovery snapshot is explicitly partial.' if recovery else 'SCHEDULE DATA VALIDATION: OK — 1–6 rosters, event shape, duplicates and source coverage are consistent.')
