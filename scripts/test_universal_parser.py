#!/usr/bin/env python3
from pathlib import Path
import importlib.util
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build',ROOT/'scripts'/'build_official_schedule.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
from universal_schedule_parser import UniversalScheduleParser
engine=UniversalScheduleParser(m)
raw=(ROOT/'tests'/'fixtures'/'5k_ld_b_2026_2027.pdf').read_bytes()
p=engine.analyze(raw,'fixture://5k_ld_b_2026_2027.pdf',5,'B','practice')
assert p.layout=='weekly-matrix',p.to_dict()
assert p.confidence>=0.8,p.to_dict()
assert len(p.groups)==10,p.to_dict()
assert len(p.week_labels)>=15,p.to_dict()
# A future matrix with a different course number still uses structure, not a
# course-specific branch. We emulate a course-independent header fingerprint.
text='РАСПИСАНИЕ занятий семинарского типа\n7 курс, поток А\n701 702 703 704\nДаты 1 2 3 4 5 6 7 8'
assert engine._infer_course(text,None)==7
assert engine._infer_stream(text,None)=='A'
print('UNIVERSAL PARSER CONTRACT: PASS')
# Generic future-week coverage: the detector must not be capped at 16 weeks.
future_text='''РАСПИСАНИЕ\n7 курс, поток А\nНеделя 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52\n701'''
# Text-only sources are accepted by the structural API through a lightweight
# fake page object, so exercise the public classification helpers directly.
assert engine._infer_course(future_text, 'future.pdf') == 7
assert len(engine._numeric_week_bands([
    (float(i),0.0,float(i+1),1.0,str(i)) for i in range(1,53)
])) == 52


# Exercise the other layout families as well; these are deliberately synthetic
# structural fingerprints so the detector is tested independently of a single
# Almazov PDF template.
class _FakePage:
    def __init__(self,text,words=None): self._text=text; self._words=words or []
    def get_text(self,mode='text'):
        if mode=='text': return self._text
        if mode=='words': return self._words
        return []
    def get_drawings(self): return []
class _FakeDoc:
    def __init__(self,text,words=None): self.page=_FakePage(text,words)
    def __iter__(self): return iter([self.page])

# The public analyzer accepts document-like sources; this checks that day/time
# schedules do not get misclassified as weekly matrices.
daily='''Расписание занятий\n5 курс, поток А\n501 502 503\nПонедельник 09:00-10:35\nВторник 10:55-12:25\nСреда 13:30-15:05\nЧетверг 15:20-16:55\nПятница 09:00-10:35'''
daily_words=[(10,10,30,20,'501'),(40,10,60,20,'502'),(70,10,90,20,'503')]
p_daily=engine.analyze(_FakeDoc(daily,daily_words),'fixture://daily.pdf',5,'A','practice')
assert p_daily.layout=='daily-grid',p_daily.to_dict()
assert p_daily.weekday_count>=5 and p_daily.clock_count>=5,p_daily.to_dict()

# One-group list format should not be promoted to a grid.
daily_list='''Расписание\n5 курс\n501\nПонедельник 09:00-10:35\nВторник 10:55-12:25'''
list_words=[(10,10,30,20,'501')]
p_list=engine.analyze(_FakeDoc(daily_list,list_words),'fixture://daily-list.pdf',5,'A','practice')
assert p_list.layout=='daily-list',p_list.to_dict()

print('UNIVERSAL LAYOUT FAMILIES: PASS — weekly-matrix, daily-grid and daily-list detection covered.')
