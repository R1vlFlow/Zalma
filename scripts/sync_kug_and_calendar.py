#!/usr/bin/env python3
"""Freshly fetch the officially published KUG PDFs and academic-week calendar.

Output files are only replaced after all 10 currently published program/course KUGs
and the academic-week calendar have been fetched, hashed, identity-checked and parsed.
"""
from __future__ import annotations
import datetime as dt
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup
import fitz
import requests

from build_official_schedule import PAGE, session, fetch_pdf, norm
from source_integrity import source_provenance

ROOT = Path(__file__).resolve().parents[1]
KUG_OUT = ROOT / 'data' / 'kug.json'
KUG_MANIFEST_OUT = ROOT / 'data' / 'kug-source-manifest.json'
WEEK_OUT = ROOT / 'data' / 'academic-weeks-2026-2027.json'
WEEK_URL = 'https://education.almazovcentre.ru/wp-content/uploads/2026/08/grafik-uchebnyh-nedel-2026-2027-uch.-god-1.pdf'

EXPECTED = {
    '31.05.01': {'title': 'Лечебное дело', 'courses': [1, 2, 3, 4, 5, 6]},
    '31.05.02': {'title': 'Педиатрия', 'courses': [1, 2]},
    '37.05.01': {'title': 'Клиническая психология', 'courses': [1, 2]},
}
FALLBACK_KUG_URLS = {
    ('31.05.01', 1): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_1-kurs.pdf',
    ('31.05.01', 2): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_2-kurs.pdf',
    ('31.05.01', 3): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_3-kurs.pdf',
    ('31.05.01', 4): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_4-kurs.pdf',
    ('31.05.01', 5): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_5-kurs.pdf',
    ('31.05.01', 6): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_6-kurs.pdf',
    ('31.05.02', 1): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_pediatriya_1-kurs.pdf',
    ('31.05.02', 2): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_pediatriya_2-kurs.pdf',
    ('37.05.01', 1): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_klinicheskaya-psihologiya_1-kurs.pdf',
    ('37.05.01', 2): 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_klinicheskaya-psihologiya_2-kurs.pdf',
}
DATE_RANGE_RE = re.compile(r'(?<!\d)(\d{2}\.\d{2}\.\d{4})\s*[-–—]\s*(\d{2}\.\d{2}\.\d{4})(?!\d)')
WEEK_RE = re.compile(r'(?<!\d)(\d{1,2})\s+(\d{2}\.\d{2}\.\d{4})\s*[-–—]\s*(\d{2}\.\d{2}\.\d{4})')


def program_from_label(text: str) -> str | None:
    t = norm(text).casefold()
    if 'клиническая психология' in t or 'klinicheskaya-psihologiya' in t:
        return '37.05.01'
    if 'педиатрия' in t or 'pediatriya' in t:
        return '31.05.02'
    if 'лечебное дело' in t or 'lechebnoe-delo' in t:
        return '31.05.01'
    return None


def discover_kug_urls(sess: requests.Session) -> dict[tuple[str, int], tuple[str, str]]:
    response = sess.get(PAGE, timeout=(15, 45))
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    candidates: dict[tuple[str, int], list[tuple[int, str, str]]] = {}
    for anchor in soup.find_all('a', href=True):
        title = norm(anchor.get_text(' ', strip=True))
        url = urljoin(PAGE, str(anchor['href']))
        combined = f'{title} {url}'
        if 'куг' not in combined.casefold() and 'календарный учебный график' not in combined.casefold():
            continue
        program = program_from_label(combined)
        if not program:
            # The official page titles KUG links explicitly. Use their course label only
            # after a known program can be resolved from the same anchor/title/url.
            continue
        match = re.search(r'(?<!\d)([1-6])\s*курс', combined, re.I)
        if not match:
            match = re.search(r'[_-]([1-6])[-_]?kurs', combined, re.I)
        if not match:
            continue
        course = int(match.group(1))
        key = (program, course)
        if key not in FALLBACK_KUG_URLS:
            continue
        text = f'{title} {url}'.casefold()
        current = 1 if ('2026' in text or '26-27' in text or '26_27' in text) else 0
        archived = 1 if ('2025' in text or '25-26' in text or '25_26' in text) else 0
        candidates.setdefault(key, []).append((current - archived, url, title or Path(url.split('?')[0]).name))
    selected = {}
    for key, fallback in FALLBACK_KUG_URLS.items():
        rows = sorted(candidates.get(key, []), key=lambda row: row[0], reverse=True)
        selected[key] = (rows[0][1], rows[0][2], 'official-hub' if rows and rows[0][0] >= 0 else 'fallback-manifest') if rows else (fallback, Path(fallback).name, 'fallback-manifest')
    return selected


def parse_kug_pdf(data: bytes, program: str, course: int, url: str) -> tuple[list[dict], str]:
    doc = fitz.open(stream=data, filetype='pdf')
    text = norm('\n'.join(page.get_text('text') for page in doc))
    expected_code = program
    if expected_code not in text:
        raise ValueError(f'KUG_SPECIALTY_MISMATCH expected={expected_code}; URL={url}')
    year = re.search(r'2026\s*[-/]\s*2027', text)
    if not year:
        raise ValueError(f'KUG_ACADEMIC_YEAR_MISMATCH expected=2026/2027; URL={url}')
    course_pattern = re.search(rf'(?<!\d){course}\s*КУРС\b', text, re.I)
    if not course_pattern:
        raise ValueError(f'KUG_COURSE_MISMATCH expected={course}; URL={url}')
    matches = list(DATE_RANGE_RE.finditer(text))
    periods: list[dict] = []
    for index, match in enumerate(matches):
        label_start = match.end()
        label_end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        label = norm(text[label_start:label_end])
        # Section headings may appear between a period and the next date range.
        label = re.sub(r'^\d{1,2}\s+семестр\s*', '', label, flags=re.I)
        label = re.split(r'\s+\d{1,2}\s+семестр\b', label, maxsplit=1, flags=re.I)[0]
        if not label:
            continue
        low = label.casefold()
        if 'нерабочие праздничные дни' in low or 'праздничные дни' in low:
            continue
        if 'государственная итоговая аттестация' in low:
            kind = 'assessment'
        elif 'промежуточная аттестация' in low or 'сессия' in low:
            kind = 'assessment'
        elif 'каникул' in low:
            kind = 'vacation'
        elif 'практик' in low:
            kind = 'practice'
        elif 'обучение' in low or 'дискретная' in low:
            kind = 'study'
        else:
            continue
        start = dt.datetime.strptime(match.group(1), '%d.%m.%Y').date()
        end = dt.datetime.strptime(match.group(2), '%d.%m.%Y').date()
        if end < start or start.year < 2026 or end.year > 2027:
            raise ValueError(f'KUG_INVALID_DATE_RANGE {match.group(0)}; URL={url}')
        periods.append({'from': start.isoformat(), 'to': end.isoformat(), 'label': label, 'kind': kind, 'sourceUrl': url})
    # Range rows must be present for study, attestation, and any explicit vacation/practice
    # published by that programme. Study and exam ranges are mandatory for every active KUG.
    if not any(p['kind'] == 'study' for p in periods):
        raise ValueError(f'KUG_NO_STUDY_PERIODS URL={url}')
    if not any(p['kind'] == 'assessment' for p in periods):
        raise ValueError(f'KUG_NO_ASSESSMENT_PERIODS URL={url}')
    # De-duplicate rows caused by repeated PDF text layers, preserving original order.
    unique: dict[tuple, dict] = {}
    for p in periods:
        unique.setdefault((p['from'], p['to'], p['kind'], p['label']), p)
    return list(unique.values()), text


def parse_week_calendar(data: bytes, url: str) -> tuple[list[dict], str]:
    doc = fitz.open(stream=data, filetype='pdf')
    text = norm('\n'.join(page.get_text('text') for page in doc))
    if 'График учебных недель' not in text or not re.search(r'2026\s*[-/]\s*2027', text):
        raise ValueError('ACADEMIC_WEEK_CALENDAR_IDENTITY_MISMATCH')
    weeks = []
    for m in WEEK_RE.finditer(text):
        number = int(m.group(1))
        start = dt.datetime.strptime(m.group(2), '%d.%m.%Y').date()
        end = dt.datetime.strptime(m.group(3), '%d.%m.%Y').date()
        if number < 1 or end < start or start.year < 2026 or end.year > 2027:
            continue
        # The source lists 22 first-semester weeks. It is intentionally not extended
        # to the rest of the academic year by guesswork.
        weeks.append({'weekNumber': number, 'from': start.isoformat(), 'to': end.isoformat()})
    unique = {w['weekNumber']: w for w in weeks}
    weeks = [unique[k] for k in sorted(unique)]
    if len(weeks) < 20 or [w['weekNumber'] for w in weeks] != list(range(1, len(weeks) + 1)):
        raise ValueError(f'ACADEMIC_WEEK_CALENDAR_INCOMPLETE weeks={len(weeks)}')
    return weeks, text


def main() -> int:
    sess = session()
    checked_at = dt.datetime.now(dt.timezone.utc).isoformat()
    kug_urls = discover_kug_urls(sess)
    kug_payload = {program: {} for program in EXPECTED}
    manifest_rows = []
    failures = []
    for (program, course), (url, title, discovery) in kug_urls.items():
        try:
            data = fetch_pdf(sess, url)
            periods, text = parse_kug_pdf(data, program, course, url)
            prov = source_provenance(data, text, url, checked_at=checked_at)
            row = {'program': program, 'programName': EXPECTED[program]['title'], 'course': course,
                   'title': title, 'url': url, 'discovery': discovery, 'status': 'live-verified',
                   'periods': len(periods), **prov}
            manifest_rows.append(row)
            kug_payload[program][str(course)] = periods
            print(f'KUG_OK {program}/{course}: {len(periods)} periods sha256={prov["sha256"]} {url}')
        except Exception as error:
            failures.append(f'{program}/{course} {url}: {type(error).__name__}: {error}')
            print('KUG_FAILED ' + failures[-1], file=sys.stderr)
    expected_keys = {(p, c) for p, info in EXPECTED.items() for c in info['courses']}
    actual_keys = {(r['program'], int(r['course'])) for r in manifest_rows}
    missing = sorted(expected_keys - actual_keys)
    if failures or missing:
        raise RuntimeError('KUG_SYNC_FAILED; no output files replaced. ' + '; '.join(failures + [f'missing KUG {p}/{c}' for p, c in missing]))

    week_data, week_text = None, None
    week_bytes = fetch_pdf(sess, WEEK_URL)
    weeks, week_text = parse_week_calendar(week_bytes, WEEK_URL)
    week_prov = source_provenance(week_bytes, week_text, WEEK_URL, checked_at=checked_at)
    week_data = {'schemaVersion': 1, 'academicYear': '2026/2027', 'generatedAt': checked_at,
                 'status': 'live-verified', 'source': {**week_prov, 'title': 'График учебных недель 2026–2027'},
                 'weeks': weeks}
    kug_manifest = {'schemaVersion': 1, 'academicYear': '2026/2027', 'generatedAt': checked_at,
                    'status': 'live-verified', 'sourcePage': PAGE,
                    'expectedProgramCourses': [{'program': p, 'course': c} for p, info in EXPECTED.items() for c in info['courses']],
                    'sources': sorted(manifest_rows, key=lambda x: (x['program'], x['course']))}
    # Fail closed on any unsupported KUG type or incomplete active programme/course coverage.
    for program, info in EXPECTED.items():
        if sorted(map(int, kug_payload[program])) != info['courses']:
            raise RuntimeError(f'KUG coverage mismatch for {program}')
    for path, content in ((KUG_OUT, kug_payload), (KUG_MANIFEST_OUT, kug_manifest), (WEEK_OUT, week_data)):
        tmp = path.with_suffix(path.suffix + '.tmp')
        tmp.write_text(json.dumps(content, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        tmp.replace(path)
    print(json.dumps({'ok': True, 'kugSources': len(manifest_rows), 'kugPeriods': sum(len(x) for c in kug_payload.values() for x in c.values()),
                      'weekCount': len(weeks), 'weekCalendarSha256': week_prov['sha256']}, ensure_ascii=False, indent=2))
    return 0

def write_sync_failure_diagnostic(error: Exception) -> dict:
    """Record a failed live-sync attempt without promoting or replacing cached data."""
    attempted_at = dt.datetime.now(dt.timezone.utc).isoformat()
    message = f'{type(error).__name__}: {error}'
    lower = message.casefold()
    discovery_failed = ('/about_institute/programm/specialist_programme/student/' in lower
                        or 'discover_kug_urls' in lower
                        or 'name-resolution' in lower
                        or 'failed to resolve' in lower)
    network_failure = any(token in lower for token in (
        'nameresolutionerror', 'name-resolution', 'failed to resolve',
        'temporary failure in name resolution', 'connectionerror', 'timed out',
        'connection refused', 'network is unreachable'))
    stage = 'official-hub-discovery' if discovery_failed else 'download-parse-or-validate'
    outcome = {
        'schemaVersion': 1,
        'attemptedAt': attempted_at,
        'status': 'failed',
        'stage': stage,
        'networkFailure': network_failure,
        'exceptionType': type(error).__name__,
        'error': str(error),
        'officialSource': PAGE,
        'rawPdfBytesDownloaded': False if discovery_failed else 'unknown',
        'officialPdfSha256Verified': 0,
        'snapshotFilesReplaced': False,
        'publicationAllowed': False,
        'recoveryPolicy': 'keep-last-known-snapshot; never promote cached data to live-verified',
    }
    report_path = ROOT / 'reports' / 'live-sync-attempt-latest.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_tmp = report_path.with_suffix(report_path.suffix + '.tmp')
    report_tmp.write_text(json.dumps(outcome, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report_tmp.replace(report_path)

    # Preserve the last schedule payloads and the snapshot's existing provenance state.
    status_path = ROOT / 'data' / 'official-sync-status.json'
    try:
        sync_status = json.loads(status_path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        sync_status = {'status': 'local-recovery'}
    sync_status['lastLiveSyncAttempt'] = {
        'attemptedAt': attempted_at,
        'command': 'npm run sync:official',
        'result': 'failed-before-source-bytes' if discovery_failed else 'failed-during-sync',
        'failedStage': stage,
        'exception': type(error).__name__,
        'reason': str(error),
        'rawPdfBytesDownloaded': False if discovery_failed else 'unknown',
        'officialPdfSha256Verified': 0,
        'snapshotFilesReplaced': False,
        'publicationAllowed': False,
        'gateStatusAfterAttempt': 'BLOCKED_FOR_PRODUCTION',
    }
    sync_status['previousStatusBeforeFailedAttempt'] = sync_status.get('status')
    sync_status['status'] = 'local-recovery'
    sync_status['message'] = ('Latest live sync failed; cached payloads were left unchanged. '
                              'No official PDF SHA-256 was verified and production publication is denied. '
                              + str(error))
    status_tmp = status_path.with_suffix(status_path.suffix + '.tmp')
    status_tmp.write_text(json.dumps(sync_status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    status_tmp.replace(status_path)
    return outcome


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        diagnostic = write_sync_failure_diagnostic(error)
        print(json.dumps(diagnostic, ensure_ascii=False, indent=2), file=sys.stderr)
        raise SystemExit(1)
