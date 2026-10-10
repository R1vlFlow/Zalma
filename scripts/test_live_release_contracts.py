#!/usr/bin/env python3
"""Offline tests for source integrity, KUG normalization and exact metadata exception."""
from __future__ import annotations
import datetime as dt
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import fitz
from source_integrity import source_provenance, date_label_audit
from sync_kug_and_calendar import parse_kug_pdf, parse_week_calendar
from build_specialist_program_schedules import doc_metadata


def pdf_bytes(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    page.insert_textbox(fitz.Rect(40, 40, 550, 800), text, fontsize=11, fontname='DejaVuSans', fontfile=font)
    data = doc.tobytes()
    doc.close()
    return data


def check(name: str, condition: bool) -> None:
    print(('PASS' if condition else 'FAIL') + ' — ' + name)
    if not condition:
        raise SystemExit(1)


sample_kug = """Приложение № 1
УТВЕРЖДЕН распоряжением от 10 апреля 2026 г. № 144
СПЕЦИАЛЬНОСТЬ 31.05.01 ЛЕЧЕБНОЕ ДЕЛО
Календарный учебный график на 2026-2027 учебный год
1 КУРС
1 семестр
01.09.2026 - 23.12.2026 Теоретическое обучение
24.12.2026 - 13.01.2027 Промежуточная аттестация
14.01.2027 - 27.01.2027 Практика
28.01.2027 - 31.01.2027 Каникулы
2 семестр
01.02.2027 - 06.06.2027 Теоретическое обучение и дискретная практика
07.06.2027 - 30.06.2027 Промежуточная аттестация
01.07.2027 - 09.07.2027 Практика
10.07.2027 - 31.08.2027 Каникулы"""
data = pdf_bytes(sample_kug)
periods, text = parse_kug_pdf(data, '31.05.01', 1, 'https://example.invalid/kug.pdf')
check('KUG parser retains study, assessment, practice and vacation periods', {'study', 'assessment', 'practice', 'vacation'}.issubset({p['kind'] for p in periods}))
check('KUG parser retains dates within academic year 2026/2027', all(p['from'][:4] in ('2026', '2027') and p['to'][:4] in ('2026', '2027') for p in periods))

week_lines = ['График учебных недель 2026-2027 уч. год']
start = dt.date(2026, 9, 1)
for n in range(1, 23):
    a = start + dt.timedelta(days=(n - 1) * 7)
    b = a + dt.timedelta(days=4)
    week_lines.append(f'{n} {a:%d.%m.%Y} - {b:%d.%m.%Y}')
weeks, _ = parse_week_calendar(pdf_bytes('\n'.join(week_lines)), 'https://example.invalid/weeks.pdf')
check('official week parser gives 22 sequentially numbered weeks', len(weeks) == 22 and [x['weekNumber'] for x in weeks] == list(range(1, 23)))
check('week 1 retains the official Tuesday-Saturday range', weeks[0]['from'] == '2026-09-01' and weeks[0]['to'] == '2026-09-05')
prov = source_provenance(data, text, 'https://example.invalid/kug.pdf', checked_at='2026-10-10T12:00:00+00:00')
check('provenance SHA-256 matches source bytes', prov['sha256'] == hashlib.sha256(data).hexdigest() and prov['contentBytes'] == len(data))
check('date label audit flags stale 2025 matrix dates', date_label_audit('2026/2027 учебный год 01.09.2025 08.09.2025')['conflictingDateYears'] == [2025])

# Only this official URL, program/course/kind, stream and all three group markers may bypass the known PDF heading typo.
url = 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_pediatry-osen-1.pdf'
header = 'РАСПИСАНИЕ ЛЕКЦИОННЫХ ЗАНЯТИЙ 2026-2027 учебный год 31.05.01 Лечебное дело 2 курс ПОТОК А Учебные группы 201П 202П 203П'
candidate = {'programHint': '31.05.02', 'courseHint': 2, 'kindHint': 'lecture', 'streamHint': 'A', 'url': url, 'title': 'Педиатрия 2 курс лекции'}
meta = doc_metadata(candidate, pdf_bytes(header), 'pdf')
check('exact peds-2 official PDF typo creates explicit auditable exception', meta['metadataException']['code'] == 'OFFICIAL_PEDS2_LECTURE_TITLE_MISLABEL' and meta['program'] == '31.05.02' and meta['stream'] == 'A')
for bad_candidate, bad_text in [
    ({**candidate, 'url': 'https://evil.invalid/peds.pdf'}, header),
    ({**candidate, 'courseHint': 3}, header),
    (candidate, header.replace('203П', '204П')),
]:
    rejected = False
    try:
        doc_metadata(bad_candidate, pdf_bytes(bad_text), 'pdf')
    except ValueError:
        rejected = True
    check('unapproved peds PDF metadata mismatch is rejected', rejected)
print('LIVE RELEASE UNIT CONTRACTS: PASS')
