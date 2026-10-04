#!/usr/bin/env python3
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))

for group, rooms in {
    '123': {'chem':'ЦДТИ, ауд. 4.2.10', 'anat':'ШКОЛА, ауд. 4'},
    '124': {'chem':'ЦДТИ, ауд.4.2.11', 'anat':'школа,ауд.4'},
}.items():
    ev=[e for e in data['courses']['1']['events'] if str(e.get('group'))==group and e.get('weekday')==0]
    for week in range(2,17):
        cur=[e for e in ev if int(e.get('weekNumber',0))==week]
        sig={(e['start'],e['end'],e['subject']) for e in cur}
        expected={
          ('09:00','10:35','Химия'),('10:55','12:25','Химия'),
          ('13:30','15:05','Анатомия человека'),('15:20','16:55','Анатомия человека')}
        assert expected <= sig, f'{group} week {week}: missing Monday double block'
        for e in cur:
            assert e.get('double') is True, f'{group} week {week}: {e["start"]} not double'
            assert e.get('doubleIndex') in (1,2), f'{group} week {week}: bad index'
            assert e.get('durationMinutes') in (85,90,95), f'{group} week {week}: bad duration'
    print(group, 'Monday double overlay: PASS')

html=(ROOT/'index.html').read_text(encoding='utf-8')
assert 'data-double-part="1"' in html and 'data-double-part="2"' in html
assert 'data-double-part="1"' in html and 'data-double-part="2"' in html
assert 'setDoubleColor(part,index)' in html
assert 'getDoubleGradient(e.doubleIndex||1)' in html
print('double color controls: PASS')
