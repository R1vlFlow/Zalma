from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from universal_schedule_parser import UniversalScheduleParser
import build_official_schedule as legacy

FIXTURE=Path(__file__).resolve().parents[1]/'tests/fixtures/6k_ld_2026_2027.pdf'
raw=FIXTURE.read_bytes()
parser=UniversalScheduleParser(legacy)
events,profile=parser.parse_practice(raw,6,'https://education.almazovcentre.ru/wp-content/uploads/2026/09/6k_ld-26-27-na-sajt-1.pdf','')
# The checked-in 6K PDF has a corrupted/missing font layer. It must be rejected
# rather than published as fake subjects. Structural analysis still has to
# recognise the weekly matrix and the complete 601–618 roster.
assert profile.layout=='weekly-matrix', profile
assert profile.confidence>=0.8, profile.confidence
assert profile.groups==[str(x) for x in range(601,619)], profile.groups
assert events==[], f'corrupt 6K fixture unexpectedly produced {len(events)} events'
print('6K CORRUPT-FIXTURE REGRESSION: PASS — weekly-matrix detected, 18 groups recognised, garbage schedule rejected.')
