#!/usr/bin/env python3
"""Regression for the official 5A/5B lecture layouts published by Almazov."""
from pathlib import Path
import importlib.util
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build',ROOT/'scripts'/'build_official_schedule.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
class Page:
    def __init__(self,text): self.text=text
    def get_text(self,kind='text'): return self.text
class Doc:
    def __init__(self,text): self.page=Page(text)
    def __iter__(self): return iter([self.page])

A='''ПН\n13:30 – 15:05 Оториноларингология (2, 6, 7, 8, 11, 12) / Травматология и ортопедия (3, 4, 5)\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\n15:20 – 16:55 Травматология и ортопедия (2, 6, 7)\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\nВТ\n13:30 – 15:05 Акушерство (2-7)\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\nСР\n13:30 – 15:05 Внутренние болезни (1-9, 11-14)\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\n15:20 – 16:55 Педиатрия (1-9, 11-14)\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\nЧТ\n13:30 – 15:05 Психиатрия (1-8) / Внутренние болезни (9, 10) / Офтальмология (11)\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\n15:20 – 16:55 Сердечно-сосудистая и торакальная хирургия (1-7)\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\nПТ\n13:30 – 15:05 Клиническая эпидемиология (1-2, 4-6) / Офтальмология (10-14)\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\n15:20 – 16:55 Клиническая эпидемиология (3)\nКоломяжский пр., 21, 3 этаж, ауд. 3.2'''
B='''СР 10:50 – 12:25 Акушерство\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\nЧТ 9:00 – 10:35 Травматология и ортопедия\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\nПТ 9:00 – 10:35 Педиатрия\nКоломяжский пр., 21, 3 этаж, ауд. 3.2\n10:50 – 12:25 Внутренние болезни\nКоломяжский пр., 21, 3 этаж, ауд. 3.2'''
for text,stream in ((A,'A'),(B,'B')):
    events=m.parse_lecture(Doc(text),5,f'fixture://5k-{stream}-lecture',stream)
    assert events, stream
    assert all(e['stream']==stream for e in events)
    assert all(e['group']=='ALL' for e in events)
print('5K LECTURE REGRESSION: PASS — A/B separate lecture layouts preserved.')
