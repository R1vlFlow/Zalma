#!/usr/bin/env python3
import io, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import universal_schedule_ingest as u

assert u.sniff_format(b'%PDF-1.7\n...', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'fake.xlsx') == 'pdf'
assert u.sniff_format(b'{\\rtf1\\ansi test}', 'application/rtf', 'x.txt') == 'rtf'

rows=[
    ['Расписание занятий', '', '', ''],
    ['День недели','Время','401','402'],
    ['ПН','09:20-10:45','Анатомия (2-4) ауд. 1','Физиология (2-4) ауд. 2'],
    ['','11:00-12:25','Биология (5-8) ауд. 3',''],
]
events=u.parse_rows(rows,4,'A','practice','fixture',lambda n:f'2026-08-{31+(n-1)*7:02d}')
assert len(events)>=3, len(events)
assert {e['group'] for e in events}=={'401','402'}
assert any(e['weekNumber']==2 for e in events)

# A long block is intentionally expanded by the main builder; the generic
# table parser itself preserves the source time range.
assert events[0]['start']=='09:20' and events[0]['end']=='10:45'
# Long published blocks are normalized by the official builder, not by the generic table reader.
print('UNIVERSAL INGEST: PASS')
