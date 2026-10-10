#!/usr/bin/env python3
"""Phase 3 parser regressions: stream heading precedence, A roster, and ORG doubles."""
from pathlib import Path
from types import SimpleNamespace
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_official_schedule as parser  # noqa: E402
from universal_schedule_parser import UniversalScheduleParser  # noqa: E402


def ok(condition, message):
    if not condition:
        raise AssertionError(message)
    print('PASS -', message)

# An explicit title is authoritative even when a URL was accidentally named for B.
meta = parser.classify_pdf(
    'Расписание занятий семинарского типа, 4 курс, поток А, Лечебное дело',
    'https://example.test/4k_ld_b-26-27-na-sajt.pdf',
    hinted_course=4, hinted_stream='B', hinted_kind='practice'
)
ok(meta == ('4', 'A', 'practice'), 'explicit Stream A heading wins over stale Stream B filename')
meta = parser.classify_pdf(
    'Расписание занятий семинарского типа, 4 курс, поток Б, Лечебное дело',
    'https://example.test/4k_ld_a-26-27-na-sajt.pdf',
    hinted_course=4, hinted_stream='A', hinted_kind='practice'
)
ok(meta == ('4', 'B', 'practice'), 'explicit Stream B heading wins over stale Stream A filename')

# This fixture is intentionally synthetic: B's matrix geometry is relabelled to
# A and its roster (401–412) to prove that the extractor is not hard-wired to B.
fixture = ROOT / 'tests' / 'fixtures' / '4k_ld_a_stream_header_2026_2027.pdf'
raw = fixture.read_bytes()
url = 'https://education.almazovcentre.ru/wp-content/uploads/2026/10/4k_ld_a-26-27-na-sajt.pdf'
engine = UniversalScheduleParser(SimpleNamespace(**vars(parser)))
events, profile = engine.parse_practice(raw, 4, url, 'A')
expected = {str(n) for n in range(401, 413)}
actual = {str(e.get('group')) for e in events}
ok(profile.stream == 'A', 'matrix layout infers Stream A from document heading')
ok(expected.issubset(actual), 'Stream A matrix parser recovers all groups 401–412')
ok(len(events) >= 200 and all(e.get('stream') == 'A' for e in events), 'Stream A matrix parser returns a substantial, consistently labelled event set')
ok(all(e.get('scheduleMode') == 'weekly-block' for e in events), 'Stream A matrix retains weekly-block semantics')

common = {
    'program': '31.05.01', 'course': 1, 'group': '123', 'stream': 'A',
    'weekNumber': 4, 'weekStart': '2026-09-21', 'weekday': 1,
    'date': '2026-09-22', 'type': 'lecture', 'location': 'ауд. 12',
    'sourceUrl': 'https://example.test/lecture.pdf'
}
first = {**common, 'subject': 'Основы Российской государственности', 'start': '09:00', 'end': '10:35'}
second = {**common, 'subject': 'ОРГ', 'start': '10:50', 'end': '12:25'}
merged = parser.merge_org_consecutive_events([second, first])
ok(len(merged) == 1 and merged[0]['start'] == '09:00' and merged[0]['end'] == '12:25', 'adjacent ORG slots merge into a single continuous event')
ok(merged[0].get('orgMerged') is True, 'merged ORG event carries an explicit parser provenance marker')

wrong_group = {**second, 'group': '124'}
ok(len(parser.merge_org_consecutive_events([first, wrong_group])) == 2, 'ORG events from different groups are not merged')
non_org = [{**first, 'subject': 'Анатомия'}, {**second, 'subject': 'Анатомия'}]
ok(len(parser.merge_org_consecutive_events(non_org)) == 2, 'non-ORG consecutive lessons are not merged by the special case')

long_org = {**common, 'subject': 'Основы Российской государственности (ОРГ)', 'start': '09:00', 'end': '12:25'}
expanded_org = parser.expand_double_lesson_events([long_org])
ok(len(expanded_org) == 1 and expanded_org[0].get('orgMerged'), 'long ORG source block stays a single event')
long_other = {**common, 'subject': 'Анатомия', 'start': '09:00', 'end': '12:25'}
expanded_other = parser.expand_double_lesson_events([long_other])
ok(len(expanded_other) == 2 and [x.get('doubleIndex') for x in expanded_other] == [1, 2], 'other long blocks retain explicit 1/2 and 2/2 parts')

print('PHASE 3 PARSER REGRESSIONS: PASS')
