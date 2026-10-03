from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from universal_schedule_parser import UniversalScheduleParser
import build_official_schedule as legacy

FIXTURE=Path(__file__).resolve().parents[1]/'tests/fixtures/6k_ld_2026_2027.pdf'
raw=FIXTURE.read_bytes()
parser=UniversalScheduleParser(legacy)
events,profile=parser.parse_practice(raw,6,'https://education.almazovcentre.ru/wp-content/uploads/2026/09/6k_ld-26-27-na-sajt-1.pdf','')
groups=sorted({e['group'] for e in events})
assert profile.layout=='weekly-matrix', profile
assert profile.confidence>=0.8
assert groups==[str(x) for x in range(601,619)], groups
assert all(e['weekday'] is None for e in events)
assert all(e['scheduleMode']=='weekly-block' for e in events)
assert all(e['stream']=='' for e in events)
assert set(e['weekNumber'] for e in events)==set(range(1,15))
assert len(events)>=240, len(events)
print(f'6K REAL MATRIX REGRESSION: PASS — {len(events)} events, 18 groups, automatic weekly-matrix detection.')
