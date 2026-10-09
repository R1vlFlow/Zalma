#!/usr/bin/env python3
"""Offline parser/data-contract checks for the current official schedule index.

This test deliberately avoids importing a remote sync entry point or relying on
public network access. Parsing and publishing are tested separately.
"""
from pathlib import Path
import json, re
ROOT=Path(__file__).resolve().parents[1]
payload=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))
assert payload.get('schemaVersion') == 7, 'unexpected official source schema'
courses=payload.get('courses')
assert isinstance(courses,dict) and len(courses)==6, 'official data must contain course records 1–6'
events=[]
for course_key,course in courses.items():
    assert isinstance(course.get('groups'),list) and isinstance(course.get('events'),list), f'course {course_key} missing groups/events'
    for event in course['events']:
        events.append((str(course_key),event))
        date=event.get('date')
        # Weekly-block rows intentionally defer the concrete date until the matrix normalizer.
        valid_date=bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(date or '')))
        valid_week_block=event.get('scheduleMode')=='weekly-block' and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}',str(event.get('weekStart','')))) and isinstance(event.get('matrixSlots'),list) and bool(event.get('matrixSlots'))
        assert valid_date or valid_week_block, f"event has neither date nor a materializable weekly block: {event.get('id')}"
        assert re.fullmatch(r'\d{2}:\d{2}',str(event.get('start',''))), f"invalid start time: {event.get('id')}"
        assert re.fullmatch(r'\d{2}:\d{2}',str(event.get('end',''))), f"invalid end time: {event.get('id')}"
        group=event.get('group') or event.get('groupName') or event.get('groups')
        assert group, f"event without group: {event.get('id')}"
# Regression for double-index metadata in group 123 source rows; materialized date/time rendering is covered in Node QA.
double_indices={e.get('doubleIndex') for course,e in events if course=='1' and str(e.get('group'))=='123' and e.get('subject') in ('Химия','Анатомия человека') and e.get('doubleIndex') is not None}
assert {1,2}.issubset(double_indices), f'group 123 double-index metadata is incomplete: {double_indices}'
assert isinstance(payload.get('kugSources'),list) and isinstance(payload.get('assessmentPeriods'),list)
assert all(x.get('sourceUrl') for x in payload['assessmentPeriods']), 'assessment period without source URL'
print(f"OFFICIAL DATA PARSER CONTRACT: PASS — {len(events)} events, {len(payload['kugSources'])} KUG sources, {len(payload['assessmentPeriods'])} source-linked periods")
