#!/usr/bin/env python3
"""Regression tests for multi-faculty Almazov source discovery and normalization."""
from __future__ import annotations
import datetime as dt
import io
import sys
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_specialist_program_schedules as specialist


def anchor(href: str, label: str) -> str:
    return f'<li><a href="{href}">{label}</a></li>'


def test_discovery_finds_pediatrics_and_clinical_psychology_stream_links():
    html = '<html><body><h2>Расписание специалитета</h2><ul>' + ''.join([
        anchor('https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_pediatry-osen-2.pdf', 'Педиатрия — 1 курс — лекции'),
        anchor('https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_pediatriya-na-sajt.pdf', 'Педиатрия — 2 курс — семинары'),
        anchor('https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_pediatry-osen-1.pdf', 'Педиатрия — 2 курс — лекции'),
        anchor('https://education.almazovcentre.ru/wp-content/uploads/2026/09/klinicheskaya-psihologiya_1-kurs_lekczii-1.pdf', 'Клиническая психология — 1 курс — лекции'),
        anchor('https://education.almazovcentre.ru/wp-content/uploads/2026/09/klinicheskaya-psihologiya_2-kurs_seminary-1.pdf', 'Клиническая психология — 2 курс — семинары'),
        anchor('https://education.almazovcentre.ru/wp-content/uploads/2026/09/klinicheskaya-psihologiya_3-kurs_lekczii.pdf', 'Клиническая психология — 3 курс — лекции'),
        anchor('https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_2k_ld.pdf', 'Календарный учебный график'),
    ]) + '</ul></body></html>'
    found = specialist.page_candidates(html)
    urls = {x['url']: x for x in found}
    assert len(found) == 6, f'expected six non-KUG candidates, got {len(found)}: {found}'
    peds = [x for x in found if x['programHint'] == '31.05.02']
    psych = [x for x in found if x['programHint'] == '37.05.01']
    assert len(peds) == 3, peds
    assert len(psych) == 3, psych
    assert all(x['kindHint'] == 'lecture' for x in found if 'lekc' in x['url'].casefold())
    assert any(x['streamHint'] == 'A' for x in specialist.page_candidates(
        '<a href="https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_ld_a.pdf">1 курс лечебное дело Поток А лекции</a>'
    )) is False, 'LD sources belong to the separate canonical LD pipeline'
    # The malformed-but-linked Pediatrics 2nd course lecture PDF is discovered,
    # then quarantined by document content verification; discovery must not hide it.
    assert any('raspisanielekczij_2k_pediatry' in u for u in urls)


def test_document_content_overrides_wrong_source_label(monkeypatch=None):
    candidate = {'programHint': '31.05.02', 'courseHint': 2, 'kindHint': 'lecture', 'streamHint': 'A',
                 'url': 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_pediatry-osen-1.pdf',
                 'title': 'Педиатрия — 2 курс — лекции'}
    original = specialist.legacy.source_preview_text
    specialist.legacy.source_preview_text = lambda data, fmt: '31.05.01 ЛЕЧЕБНОЕ ДЕЛО\n2 курс\nПоток А\nЗанятия лекционного типа\n2026/2027'
    try:
        try:
            specialist.doc_metadata(candidate, b'fixture', 'pdf')
        except ValueError as exc:
            assert 'SOURCE_FACULTY_MISMATCH' in str(exc)
        else:
            raise AssertionError('A wrong-faculty PDF must be quarantined')
    finally:
        specialist.legacy.source_preview_text = original


def test_document_header_can_supply_flow_a_when_filename_does_not():
    candidate = {'programHint': '31.05.02', 'courseHint': 1, 'kindHint': 'lecture', 'streamHint': None,
                 'url': 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/schedule-pediatry.pdf',
                 'title': 'Педиатрия — 1 курс — лекции'}
    original = specialist.legacy.source_preview_text
    specialist.legacy.source_preview_text = lambda data, fmt: '31.05.02 Педиатрия\n1 курс\nПоток А\nЗанятия лекционного типа\n2026/2027'
    try:
        meta = specialist.doc_metadata(candidate, b'fixture', 'pdf')
        assert meta['stream'] == 'A'
        assert meta['program'] == '31.05.02'
    finally:
        specialist.legacy.source_preview_text = original



def test_academic_year_window_tracks_current_and_next_cycle():
    assert specialist.accepted_academic_year_starts(dt.date(2026, 10, 10)) == {2026, 2027}
    assert specialist.accepted_academic_year_starts(dt.date(2027, 3, 1)) == {2026, 2027}
    assert specialist.accepted_academic_year_starts(dt.date(2027, 8, 1)) == {2027, 2028}


def test_weekly_block_dates_and_group_suffixes():
    base = {'weekStart': '2026-10-05', 'weekday': 5}
    assert specialist.materialize_dates(base) == ['2026-10-10']
    assert specialist.materialize_dates({'weekStart': '2026-10-05', 'matrixSlots': [0, 2, 5]}) == ['2026-10-05', '2026-10-07', '2026-10-10']
    meta = {'program': '31.05.02', 'course': 2, 'kind': 'practice', 'stream': 'B',
            'url': 'https://example.invalid/pediatria-practice.pdf', 'title': 'Pediatria practice', 'format': 'pdf'}
    ev = specialist.normalize_events([{'date': '2026-10-10', 'start': '09:00', 'end': '10:35',
                                      'subject': 'Биология', 'group': '201', 'location': '101', 'teacher': 'Иванов И.И.'}], meta)
    assert len(ev) == 1
    assert ev[0]['group'] == '201П'
    assert ev[0]['stream'] == 'B'
    meta['program'] = '37.05.01'
    ev2 = specialist.normalize_events([{'date': '2026-10-10', 'start': '09:00', 'end': '10:35',
                                       'subject': 'Психология', 'group': '201', 'location': '101', 'teacher': 'Петров П.П.'}], meta)
    assert ev2[0]['group'] == '201КП'


def test_adjacent_double_slots_merge_but_identity_conflicts_do_not():
    base = {'program': '31.05.02', 'course': 1, 'group': '101П', 'stream': 'A', 'date': '2026-10-05',
            'type': 'practice', 'subject': 'Основы российской государственности', 'location': '101',
            'teacher': 'Иванов И.И.', 'sourceUrl': 'https://example.invalid/a.pdf'}
    slots = [dict(base, start='09:00', end='10:35'), dict(base, start='10:50', end='12:25')]
    merged = specialist.legacy.merge_consecutive_identical_events(slots)
    assert len(merged) == 1 and merged[0]['start'] == '09:00' and merged[0]['end'] == '12:25'
    assert merged[0]['orgMerged'] is True
    changed_room = [dict(slots[0]), dict(slots[1], location='102')]
    assert len(specialist.legacy.merge_consecutive_identical_events(changed_room)) == 2
    changed_teacher = [dict(slots[0]), dict(slots[1], teacher='Сидоров С.С.')]
    assert len(specialist.legacy.merge_consecutive_identical_events(changed_teacher)) == 2
    explicit_halves = [dict(slots[0], half='1/2'), dict(slots[1], half='2/2')]
    assert len(specialist.legacy.merge_consecutive_identical_events(explicit_halves)) == 2
    triple = [dict(base, start='09:00', end='10:35'), dict(base, start='10:50', end='12:25'), dict(base, start='12:40', end='14:15')]
    combined = specialist.legacy.merge_consecutive_identical_events(triple)
    assert len(combined) == 1 and combined[0]['start'] == '09:00' and combined[0]['end'] == '14:15' and combined[0]['mergedSlotCount'] == 3


def test_org_source_long_block_stays_one_event_after_normalization():
    meta = {'program': '31.05.02', 'course': 1, 'kind': 'lecture', 'stream': 'A',
            'url': 'https://example.invalid/org.pdf', 'title': 'ОРГ', 'format': 'pdf'}
    ev = specialist.normalize_events([{'date': '2026-10-05', 'start': '09:00', 'end': '12:25',
                                      'subject': 'Основы Российской государственности', 'group': '101',
                                      'location': '101', 'teacher': 'Иванов И.И.'}], meta)
    assert len(ev) == 1
    assert ev[0]['start'] == '09:00' and ev[0]['end'] == '12:25'
    assert ev[0]['orgMerged'] is True



def test_course_discovery_and_document_validation_support_courses_one_to_six():
    candidate = {'programHint': '37.05.01', 'courseHint': 3, 'kindHint': 'lecture', 'streamHint': 'A',
                 'url': 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/klinpsych_3k_lekcii.pdf',
                 'title': 'Клиническая психология — 3 курс — лекции'}
    original = specialist.legacy.source_preview_text
    specialist.legacy.source_preview_text = lambda data, fmt: '37.05.01 КЛИНИЧЕСКАЯ ПСИХОЛОГИЯ\n3 курс\nПоток А\nЗанятия лекционного типа\n2026/2027'
    try:
        meta = specialist.doc_metadata(candidate, b'fixture', 'pdf')
        assert meta['course'] == 3 and meta['program'] == '37.05.01' and meta['stream'] == 'A'
    finally:
        specialist.legacy.source_preview_text = original


def test_image_source_preview_uses_ocr_for_identity_validation():
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (120, 60), 'white').save(buf, format='PNG')
    original = specialist.legacy.source_preview_text
    try:
        specialist.legacy.source_preview_text = original
        with patch('pytesseract.image_to_string', return_value='31.05.02 Педиатрия\nПоток А\n2026/2027') as ocr:
            text = specialist.legacy.source_preview_text(buf.getvalue(), 'image')
        assert '31.05.02' in text and 'Поток А' in text
        ocr.assert_called_once()
        assert ocr.call_args.kwargs['lang'] == 'rus+eng'
    finally:
        specialist.legacy.source_preview_text = original

def main():
    tests = [test_discovery_finds_pediatrics_and_clinical_psychology_stream_links,
             test_document_content_overrides_wrong_source_label,
             test_document_header_can_supply_flow_a_when_filename_does_not,
             test_academic_year_window_tracks_current_and_next_cycle,
             test_weekly_block_dates_and_group_suffixes,
             test_adjacent_double_slots_merge_but_identity_conflicts_do_not,
             test_org_source_long_block_stays_one_event_after_normalization,
             test_course_discovery_and_document_validation_support_courses_one_to_six,
             test_image_source_preview_uses_ocr_for_identity_validation]
    for test in tests:
        test()
        print(f'PASS {test.__name__}')
    print(f'{len(tests)}/{len(tests)} specialist source regression tests passed')

if __name__ == '__main__':
    main()
