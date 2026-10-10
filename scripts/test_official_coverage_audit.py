#!/usr/bin/env python3
"""Contract checks for the detailed official source and group coverage audit."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPORT=json.loads((ROOT/'reports/official-coverage-audit-2026-10-10.json').read_text(encoding='utf-8'))
assert REPORT['overall_status']=='BLOCKED_FOR_PRODUCTION'
assert REPORT['summary']['known_ld_groups']==150
assert REPORT['summary']['known_non_ld_groups_with_rules']==14
assert REPORT['summary']['published_timetable_courses']==10
assert REPORT['summary']['kug_courses_present_in_local_json']==10
assert REPORT['summary']['ld_groups_missing_direct_practice_records']==42
assert REPORT['summary']['ld_groups_with_weekly_block_practice_records']==34
assert REPORT['summary']['ld_groups_with_dated_practice_records']==74
assert REPORT['summary']['ld_weekly_block_practice_records']==692
assert REPORT['local_snapshot']['dataState']=='local-recovery-snapshot'
assert REPORT['local_snapshot']['program_schedules_json_present'] is True
SPEC=json.loads((ROOT/'data/program-schedules.json').read_text(encoding='utf-8'))
assert SPEC['dataState']=='local-recovery-snapshot'
assert sum(len(c.get('events',[])) for pr in SPEC['programs'].values() for c in pr['courses'].values())==1544
assert REPORT['summary']['kug_expected_course_count']==10
rows=REPORT['group_rows']
assert len(rows)==164
ld={(r['course'],r['group'],r['stream']):r for r in rows if r['program']=='31.05.01'}
assert ld[(1,'103','A')]['practice_direct_group_records']==0
for group in [str(x) for x in range(217,223)]+['225','226','227','228','229']:
    assert ld[(2,group,'B')]['practice_direct_group_records']==0
for course,stream,groups in [(4,'A',range(401,413)),(4,'B',range(413,425)),(5,'B',range(513,523))]:
    for group in groups:
        row=ld[(course,str(group),stream)]
        assert row['practice_direct_group_records']>0
        assert row['practice_weekly_block_records']>0
        assert row['practice_dated_records']==0
        assert row['practice_timing_status']=='weekly-block-week-only'
for group in range(501,513): assert ld[(5,str(group),'A')]['practice_direct_group_records']==0
for group in range(601,619): assert ld[(6,str(group),'common')]['practice_direct_group_records']==0
assert any('2025' in f['finding'] and f['program']=='31.05.01' for f in REPORT['source_integrity_findings'])
assert any(f.get('course')==4 and '250 source records' in f['finding'] for f in REPORT['source_integrity_findings'])
assert any(f.get('course')==6 and 'corrupt' in f['finding'].lower() for f in REPORT['source_integrity_findings'])
print('OFFICIAL COVERAGE AUDIT CONTRACT: PASS')
