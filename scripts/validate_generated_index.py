#!/usr/bin/env python3
"""Validate the freshly generated official-schedules.json.

This is deliberately separate from the GitHub Actions YAML so the exact same
validation can be run locally and in CI. It validates the GENERATED file only;
the bootstrap file in git is allowed to have zero events for course 6.
"""
from pathlib import Path
import json, re, sys

ROOT = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from schedule_validation_common import bootstrap_event_errors, calendar_consistency_errors
DATA_PATH = ROOT / 'data' / 'official-schedules.json'
EXPECTED_SCHEMA = 7
EXPECTED = {
    '1': {'A': list(map(str, range(101,123))), 'B': list(map(str, range(123,136)))},
    '2': {'A': list(map(str, range(201,217))), 'B': list(map(str, range(217,230)))},
    '3': {'A': list(map(str, range(301,313))), 'B': list(map(str, range(313,323)))},
    '4': {'A': list(map(str, range(401,413))), 'B': list(map(str, range(413,425)))},
    '5': {'A': list(map(str, range(501,513))), 'B': list(map(str, range(513,523)))},
    '6': {'': list(map(str, range(601,619)))},
}

def fail(*lines):
    print('GENERATED INDEX VALIDATION: FAILED')
    for line in lines:
        print(' - ' + line)
    raise SystemExit(1)

if not DATA_PATH.exists():
    fail('data/official-schedules.json was not produced')
try:
    data = json.loads(DATA_PATH.read_text(encoding='utf-8'))
except Exception as exc:
    fail(f'cannot parse JSON: {exc}')

raw_schema = data.get('schemaVersion')
try:
    schema = int(raw_schema)
except (TypeError, ValueError):
    fail(f'invalid schemaVersion={raw_schema!r} (type={type(raw_schema).__name__}), expected {EXPECTED_SCHEMA}')
if schema != EXPECTED_SCHEMA:
    fail(f'invalid schemaVersion={raw_schema!r} (type={type(raw_schema).__name__}), expected {EXPECTED_SCHEMA}')
if not data.get('generatedAt'):
    fail('generatedAt missing')


# Bootstrap data may defer roster/event completeness, but every shipped event
# must still satisfy the common structural/calendar invariants.
bootstrap_errors = bootstrap_event_errors(data) + calendar_consistency_errors(data)
if bootstrap_errors:
    fail('bootstrap/event invariant errors:', *bootstrap_errors[:100])

if data.get('dataState') == 'bootstrap-pending':
    print(f'GENERATED INDEX VALIDATION: OK — bootstrap-pending; strict event validation is deferred to the first live GitHub synchronization.')
    raise SystemExit(0)
if data.get('dataState') not in {None, 'live-generated', 'local-recovery-snapshot'}:
    fail(f"unsupported dataState={data.get('dataState')!r}")

courses = data.get('courses')
if not isinstance(courses, dict):
    fail('courses object missing')

errors=[]
for cid, roster in EXPECTED.items():
    c = courses.get(cid)
    if not isinstance(c, dict):
        errors.append(f'{cid}: course object missing')
        continue
    groups = set(map(str, c.get('groups', [])))
    expected_groups = {g for xs in roster.values() for g in xs}
    missing = sorted(expected_groups-groups, key=int)
    extra = sorted(groups-expected_groups, key=int)
    if missing: errors.append(f'{cid}: missing groups {missing}')
    if extra: errors.append(f'{cid}: unexpected groups {extra}')
    streams = c.get('streams') or {}
    for st, expected_groups_list in roster.items():
        actual = set(map(str, streams.get(st, [])))
        if set(expected_groups_list) != actual:
            errors.append(f'{cid}/{st or "None"}: stream roster mismatch')
    events = c.get('events') or []
    if not events: errors.append(f'{cid}: events empty')
    if not any(e.get('type')=='lecture' for e in events): errors.append(f'{cid}: lecture events missing')
    if not any(e.get('type')=='practice' for e in events): errors.append(f'{cid}: practice events missing')
    seen=set()
    for e in events:
        if e.get('type') not in {'lecture','practice'}:
            errors.append(f'{cid}: invalid event type {e.get("type")!r}')
        stream = e.get('stream','') or ''
        if cid=='6' and stream!='': errors.append(f'6: non-empty stream {stream!r}')
        if cid!='6' and stream not in {'A','B'}: errors.append(f'{cid}: invalid stream {stream!r}')
        if e.get('type')=='practice' and not re.fullmatch(r'\d{3}', str(e.get('group',''))):
            errors.append(f'{cid}: practice event without 3-digit group')
        if e.get('type')=='lecture' and e.get('group')!='ALL':
            errors.append(f'{cid}: lecture must have group=ALL')
        wd=e.get('weekday')
        if wd is not None and wd not in range(7): errors.append(f'{cid}: invalid weekday {wd!r}')
        if wd is None and e.get('type')!='practice': errors.append(f'{cid}: lecture without weekday')
        if wd is None and cid in {'4','5','6'} and e.get('scheduleMode')!='weekly-block':
            errors.append(f'{cid}: weekly practice without scheduleMode=weekly-block')
        if not re.fullmatch(r'\d{2}:\d{2}', str(e.get('start',''))) or not re.fullmatch(r'\d{2}:\d{2}', str(e.get('end',''))):
            errors.append(f'{cid}: non-canonical time {e.get("start")}-{e.get("end")}')
        key=(e.get('type'),stream,e.get('group'),e.get('weekNumber'),e.get('date'),wd,e.get('start'),e.get('end'),e.get('subject'),e.get('location'))
        if key in seen: errors.append(f'{cid}: exact duplicate event {key}')
        seen.add(key)
    if cid in {'1','2','3','4','5'}:
        for st in ('A','B'):
            if not any(e.get('stream','')==st and e.get('type')=='lecture' for e in events): errors.append(f'{cid}/{st}: lecture missing')
            if data.get('dataState') != 'local-recovery-snapshot' and not any(e.get('stream','')==st and e.get('type')=='practice' for e in events): errors.append(f'{cid}/{st}: practice missing')
    else:
        if not any(e.get('stream','')=='' and e.get('type')=='lecture' for e in events): errors.append('6: lecture missing')
        if not any(e.get('stream','')=='' and e.get('type')=='practice' for e in events): errors.append('6: practice missing')

if errors:
    fail(*errors)

print(f'GENERATED INDEX VALIDATION: OK — schema={schema}, generatedAt={data.get("generatedAt")}')
print('All six courses have valid local structure; live-generated indexes additionally require lecture/practice coverage for every stream.')
