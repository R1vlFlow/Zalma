#!/usr/bin/env python3
"""Real-source regression for the official 5B matrix PDF supplied by the user."""
from pathlib import Path
import importlib.util
from collections import Counter, defaultdict

ROOT=Path(__file__).resolve().parents[1]
PDF=ROOT/'tests'/'fixtures'/'5k_ld_b_2026_2027.pdf'
spec=importlib.util.spec_from_file_location('build',ROOT/'scripts'/'build_official_schedule.py')
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
raw=PDF.read_bytes()
events=mod.parse_practice(raw,5,'fixture://5k_ld_b_2026_2027.pdf','B')
expected_groups={str(x) for x in range(513,523)}
got_groups={str(e.get('group')) for e in events}
assert got_groups==expected_groups,(got_groups,expected_groups)
assert len(events)>=180,len(events)
assert all(e.get('stream')=='B' for e in events)
assert all(e.get('type')=='practice' for e in events)
assert all(e.get('weekday') is None for e in events)
assert all(e.get('scheduleMode')=='weekly-block' for e in events)
assert all((e.get('start'),e.get('end'))==('13:30','16:55') for e in events)
assert all(1<=int(e.get('weekNumber',0))<=15 for e in events)
assert all(e.get('layoutProfile')=='weekly-matrix' for e in events)
assert min(Counter(str(e['group']) for e in events).values())>=17
by=defaultdict(list)
for e in events: by[(str(e['group']),int(e['weekNumber']))].append(e['subject'])
assert sorted(by[('513',1)])==['Внутренние болезни']
assert sorted(by[('513',4)])==['Внутренние болезни','Сердечно-сосудистая и торакальная хирургия']
assert sorted(by[('519',14)])==['Клиническая эпидемиология','Травматология и ортопедия']
assert sorted(by[('521',3)])==['Акушерство и гинекология','Внутренние болезни']
print(f'5K REAL MATRIX REGRESSION: PASS — {len(events)} events, 10 groups, 15 weeks, automatic matrix detection.')
