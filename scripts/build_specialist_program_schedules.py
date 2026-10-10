#!/usr/bin/env python3
"""Discover, parse and publish non-LD specialist schedules from the official hub.

The official student page is the source of truth for links. Documents are sniffed by
content rather than their extension or displayed filename. The last valid snapshot
is preserved when the page or any required source is temporarily unavailable.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import importlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import build_official_schedule as legacy
from universal_schedule_ingest import parse_source_bytes
from bs4 import BeautifulSoup

PAGE = legacy.PAGE
OUT = ROOT / 'data' / 'program-schedules.json'
PROGRAMS = {
    '31.05.02': {'title': 'Педиатрия', 'suffix': 'П'},
    '37.05.01': {'title': 'Клиническая психология', 'suffix': 'КП'},
}


def normalize_space(value: object) -> str:
    return re.sub(r'\s+', ' ', str(value or '').replace('\xa0', ' ')).strip()


def canonical_url(value: str) -> str:
    u = urlsplit(value)
    return urlunsplit((u.scheme, u.netloc, u.path, u.query, ''))


def detect_program(text: str) -> str | None:
    t = normalize_space(text).casefold()
    if re.search(r'\b37\.05\.01\b|клиническ\w*\s+психолог|klinich\w*[-_ ]psih|klin\w*[-_ ]psih', t):
        return '37.05.01'
    if re.search(r'\b31\.05\.02\b|педиатр\w*|pediatr\w*|pediatry', t):
        return '31.05.02'
    if re.search(r'\b31\.05\.01\b|лечебн\w*\s+дело|лечебн\w*\s+факультет|(?:^|[/_-])ld(?:[/_.-]|$)|lechebnoe', t):
        return '31.05.01'
    return None


def infer_course(text: str) -> int | None:
    t = normalize_space(text).casefold()
    patterns = (
        r'(?<!\d)([1-6])\s*курс\b',
        r'(?<!\d)([1-6])\s*[-_]?\s*k(?:urs)?(?:[_\-.\s]|$)',
        r'(?<!\d)([1-6])k(?=[_-])',
        r'(?<!\d)([1-6])[-_]kurs\b',
    )
    for pattern in patterns:
        m = re.search(pattern, t, re.I)
        if m:
            return int(m.group(1))
    return None


def infer_stream(text: str) -> str | None:
    t = normalize_space(text).upper().replace('А', 'A').replace('Б', 'B')
    m = re.search(r'\bПОТОК\s*([AB])\b', t)
    if m:
        return m.group(1)
    m = re.search(r'(?:^|[/_-])([AB])(?:[_\-.]|$)', t)
    return m.group(1) if m else None


def infer_kind(text: str) -> str | None:
    t = normalize_space(text).casefold()
    if re.search(r'заняти\w*\s+лекционн\w*\s+типа|лекци\w*|lekc\w*|lecture', t):
        return 'lecture'
    if re.search(r'заняти\w*\s+семинарск\w*\s+типа|семинар\w*|praktik\w*|seminar\w*|практик\w*|\bпз\b|_ld(?:_|-)', t):
        return 'practice'
    return None


def accepted_academic_year_starts(today: dt.date | None = None) -> set[int]:
    """Accept the active academic year and the next published cycle."""
    today = today or dt.date.today()
    current_start = today.year if today.month >= 7 else today.year - 1
    return {current_start, current_start + 1}


def page_candidates(html: str) -> list[dict]:
    """Find current schedule links, including links whose label omits the course."""
    soup = BeautifulSoup(html, 'html.parser')
    candidates: list[dict] = []
    seen: set[str] = set()
    for anchor in soup.find_all('a', href=True):
        href = canonical_url(urljoin(PAGE, str(anchor['href'])))
        title = normalize_space(anchor.get_text(' ', strip=True))
        # Context provides the enclosing course header when the link text is generic.
        context = title
        for parent in anchor.parents:
            if getattr(parent, 'name', None) in {'h1', 'h2', 'h3', 'h4', 'li'}:
                ptxt = normalize_space(parent.get_text(' ', strip=True))
                if 0 < len(ptxt) <= 500:
                    context = f'{ptxt} {context}'
                if parent.name in {'h1', 'h2', 'h3', 'h4'}:
                    break
        low = f'{context} {href}'.casefold()
        if any(x in low for x in ('куг', 'календарный учебный график', 'график учебных недель', 'индивидуальн', 'зач.кн', 'промежуточная аттестация', 'академический отпуск')):
            continue
        program = detect_program(low)
        if program not in PROGRAMS:
            continue
        if not any(x in low for x in ('распис', 'лекц', 'семинар', 'практик', 'заняти', 'pediatr', 'педиатр', 'klinich', 'клиническ')):
            continue
        course = infer_course(href) or infer_course(context)
        if course not in (1, 2, 3, 4, 5, 6):
            continue
        kind = infer_kind(f'{title} {href}')
        if not kind:
            continue
        # Keep only file/upload URLs. The payload is format-sniffed after fetch.
        if not (urlsplit(href).path.startswith('/wp-content/uploads/') or re.search(r'\.(?:pdf|xlsx?|ods|csv|html?)(?:$|\?)', href, re.I)):
            continue
        if href in seen:
            continue
        seen.add(href)
        candidates.append({'programHint': program, 'courseHint': course, 'kindHint': kind,
                           'streamHint': infer_stream(f'{context} {href}'), 'url': href,
                           'title': title or Path(urlsplit(href).path).name, 'context': context})
    return candidates


def doc_metadata(candidate: dict, data: bytes, fmt: str) -> dict:
    text = legacy.source_preview_text(data, fmt)
    header = text[:12000]
    body_program = detect_program(header)
    program = candidate['programHint']
    if body_program and body_program != program:
        raise ValueError(f"SOURCE_FACULTY_MISMATCH expected={program} document={body_program} url={candidate['url']}")
    course = infer_course(header) or candidate['courseHint']
    # The document heading wins over a stale filename and over link context.
    kind = infer_kind(header) or candidate['kindHint']
    stream = infer_stream(header) or candidate.get('streamHint')
    year_matches = re.findall(r'(20\d{2})\s*[/\-]\s*(20\d{2})', header)
    allowed_starts = accepted_academic_year_starts()
    invalid_years = [f'{start}/{end}' for start, end in year_matches
                     if int(end) != int(start) + 1 or int(start) not in allowed_starts]
    if invalid_years:
        raise ValueError(f"SOURCE_ACADEMIC_YEAR_MISMATCH year={invalid_years[0]} url={candidate['url']}")
    if course not in (1, 2, 3, 4, 5, 6) or kind not in ('lecture', 'practice'):
        raise ValueError(f"SOURCE_METADATA_INCOMPLETE course={course} kind={kind} url={candidate['url']}")
    return {'program': program, 'course': int(course), 'kind': kind, 'stream': stream,
            'title': candidate['title'], 'url': candidate['url'], 'format': fmt, 'preview': header}


def materialize_dates(event: dict) -> list[str]:
    direct = legacy.norm(event.get('date'))
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', direct):
        return [direct]
    base = legacy.norm(event.get('weekStart'))
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', base):
        week = event.get('weekNumber')
        if week not in (None, ''):
            try:
                base = legacy.week_start(int(week))
            except (TypeError, ValueError):
                base = ''
    try:
        start_date = dt.date.fromisoformat(base)
    except ValueError:
        return []
    slots = event.get('matrixSlots')
    if isinstance(slots, list) and slots:
        out = []
        for val in slots:
            try:
                offset = int(val)
            except (ValueError, TypeError):
                continue
            if 0 <= offset <= 6:
                out.append((start_date + dt.timedelta(days=offset)).isoformat())
        return sorted(set(out))
    weekday = event.get('weekday')
    if weekday is None:
        return []
    try:
        wd = int(weekday)
    except (TypeError, ValueError):
        return []
    return [(start_date + dt.timedelta(days=wd)).isoformat()] if 0 <= wd <= 6 else []


def clean_teacher(value: object) -> str:
    text = legacy.norm(value)
    text = re.sub(r'^(?:преподаватель|преп\.?|доцент|профессор)\s*[:—-]?\s*', '', text, flags=re.I)
    text = re.sub(r'\s+', ' ', text).strip(' ,;/')
    return text


def normalize_half(value: object) -> str | None:
    """Normalize explicit subgroup markers without inventing a stream."""
    text = normalize_space(value).casefold().replace('\\', '/')
    if not text:
        return None
    aliases = {'1': '1/2', '1/2': '1/2', 'перв': '1/2', 'первая': '1/2',
               '2': '2/2', '2/2': '2/2', 'втор': '2/2', 'вторая': '2/2'}
    return aliases.get(text, text if text in {'1/2', '2/2'} else None)


def normalize_events(raw_events: list[dict], meta: dict) -> list[dict]:
    suffix = PROGRAMS[meta['program']]['suffix']
    out: list[dict] = []
    for ix, raw in enumerate(raw_events):
        if not isinstance(raw, dict):
            continue
        subject = legacy.clean_subject(raw.get('subject', ''))
        start = legacy.normalize_clock(raw.get('start'))
        end = legacy.normalize_clock(raw.get('end'))
        if not subject or not start or not end or start >= end:
            print(f"PARSER_ANOMALY invalid_event source={meta['url']} idx={ix} subject={subject!r} time={start}-{end}", file=sys.stderr)
            continue
        group = legacy.norm(raw.get('group') or 'ALL')
        if group.upper() not in {'ALL', '*', 'ОБЩИЕ', 'ОБЩАЯ', 'ВСЕ'} and re.fullmatch(r'\d{3,4}', group):
            group += suffix
        dates = materialize_dates(raw)
        if not dates:
            print(f"PARSER_ANOMALY missing_schedule_date source={meta['url']} group={group} subject={subject!r}", file=sys.stderr)
            continue
        location = legacy.clean_location(raw.get('location', ''))
        teacher = clean_teacher(raw.get('teacher', ''))
        for date in dates:
            fingerprint = hashlib.sha1(f"{meta['url']}|{meta['program']}|{meta['course']}|{group}|{date}|{start}|{end}|{subject}|{teacher}|{location}|{ix}".encode('utf-8')).hexdigest()[:10]
            out.append({
                'id': f"{meta['program']}-{meta['course']}-{group}-{date}-{start.replace(':','')}-{end.replace(':','')}-{fingerprint}",
                'program': meta['program'], 'course': int(meta['course']), 'group': group,
                'stream': meta.get('stream'), 'date': date, 'start': start, 'end': end,
                'subject': subject, 'location': location, 'teacher': teacher,
                'type': meta['kind'], 'half': normalize_half(raw.get('half')),
                'double': bool(raw.get('double') or raw.get('orgMerged') or raw.get('mergedConsecutive')),
                'orgMerged': bool(raw.get('orgMerged')), 'mergedConsecutive': bool(raw.get('mergedConsecutive')),
                'doublePart': raw.get('doublePart'), 'doubleIndex': raw.get('doubleIndex'),
                'doubleOf': raw.get('doubleOf'), 'durationMinutes': (int(end[:2])*60+int(end[3:]))-(int(start[:2])*60+int(start[3:])),
                'weeks': f"нед. {raw['weekNumber']}" if raw.get('weekNumber') not in (None, '') else '',
                'weekNumber': raw.get('weekNumber'), 'weekStart': raw.get('weekStart'), 'weekday': raw.get('weekday'),
                'sourceUrl': meta['url'], 'sourceTitle': meta['title'], 'sourceKind': meta['format'],
                'confidence': 0.92, 'parser': raw.get('parser', f"universal-ingest-{meta['format']}-v2")
            })
    # Keep metadata for diagnostics but remove exact repeated exports across first-week + semester PDFs.
    deduped: dict[tuple, dict] = {}
    for event in out:
        key = (event['program'], event['course'], event['group'], event['stream'], event['date'], event['start'], event['end'],
               event['subject'].casefold(), event['location'].casefold(), event.get('teacher','').casefold(), event['type'], event.get('half') or '')
        old = deduped.get(key)
        if old is None or event['confidence'] > old.get('confidence', 0):
            deduped[key] = event
    events = list(deduped.values())
    # Expand legacy long slots then immediately re-merge identical adjacent slots. ORG stays marked as a continuous block.
    expanded = legacy.expand_double_lesson_events(events)
    merged = legacy.merge_consecutive_identical_events(expanded)
    return merged


def parse_one(candidate: dict, session) -> tuple[dict, list[dict]]:
    data, fmt, _content_type = legacy.fetch_source(session, candidate['url'])
    meta = doc_metadata(candidate, data, fmt)
    # Parse with the common, layout-adaptive ingestion engine. This avoids a separate parser per faculty.
    raw_events = parse_source_bytes(data, fmt, meta['course'], meta.get('stream') or '', meta['kind'], meta['url'], legacy)
    if isinstance(raw_events, list) and raw_events and isinstance(raw_events[0], dict) and 'subject' not in raw_events[0] and 'events' in raw_events[0]:
        flattened = []
        for week in raw_events:
            for raw in week.get('events', []):
                item = dict(raw)
                item.setdefault('weekStart', week.get('start'))
                flattened.append(item)
        raw_events = flattened
    for event in raw_events:
        event.setdefault('sourceUrl', meta['url'])
        # Don't let the parser silently assign a different stream than the document.
        event['stream'] = meta.get('stream') or event.get('stream') or None
        event['type'] = meta['kind']
    normalized = normalize_events(raw_events, meta)
    if not normalized:
        raise ValueError(f"PARSER_EMPTY_SOURCE format={fmt} title={meta['title']} url={meta['url']}")
    return meta, normalized


def load_last_good() -> dict | None:
    try:
        payload = json.loads(OUT.read_text(encoding='utf-8'))
        if payload.get('schemaVersion') == 1 and payload.get('programs'):
            return payload
    except Exception:
        return None
    return None


def build_payload(session, previous: dict | None) -> dict:
    try:
        response = session.get(PAGE, timeout=(15, 45))
        response.raise_for_status()
    except Exception as error:
        if previous:
            print(f"SOURCE_PAGE_UNAVAILABLE keep_last_good generatedAt={previous.get('generatedAt')} error={error}", file=sys.stderr)
            return previous
        raise RuntimeError(f"No last-good snapshot and official page is unavailable: {error}")

    candidates = page_candidates(response.text)
    if not candidates:
        if previous:
            print(f"SOURCE_DISCOVERY_EMPTY keep_last_good generatedAt={previous.get('generatedAt')}", file=sys.stderr)
            return previous
        raise RuntimeError('Official page discovery returned no current pediatric/clinical psychology schedules; will not publish an empty snapshot.')

    parsed_by_key: dict[tuple, dict] = {}
    failures: list[dict] = []
    for candidate in candidates:
        try:
            meta, events = parse_one(candidate, session)
            record_key = (meta['program'], meta['course'], meta['kind'], meta.get('stream') or '', meta['url'])
            parsed_by_key[record_key] = {'meta': meta, 'events': events}
            print(f"SPECIALIST_SOURCE_OK program={meta['program']} course={meta['course']} kind={meta['kind']} stream={meta.get('stream') or '-'} events={len(events)} url={meta['url']}")
        except Exception as error:
            fail = {**candidate, 'error': f'{type(error).__name__}: {error}'}
            failures.append(fail)
            print(f"SPECIALIST_SOURCE_QUARANTINED programHint={candidate['programHint']} courseHint={candidate['courseHint']} url={candidate['url']} error={fail['error']}", file=sys.stderr)

    discovered_courses = {(c['programHint'], int(c['courseHint'])) for c in candidates if c.get('courseHint') is not None}
    programs: dict[str, dict] = {}
    for code, details in PROGRAMS.items():
        courses: dict[str, dict] = {}
        for course in range(1, 7):
            recs = [v for k, v in parsed_by_key.items() if k[0] == code and k[1] == course]
            events = [event for rec in recs for event in rec['events']]
            source_errors = [x for x in failures if x['programHint'] == code and x['courseHint'] == course]
            previous_course = (((previous or {}).get('programs') or {}).get(code) or {}).get('courses', {}).get(str(course), {})
            # A partially reachable official page must not erase an event series
            # from a source that failed parsing today. Reuse last-good rows only
            # for that exact source URL; do not copy another faculty/stream's data.
            failed_urls = {str(x.get('url') or '') for x in source_errors}
            if failed_urls and isinstance(previous_course.get('events'), list):
                fresh_keys = {(e.get('group'), e.get('stream'), e.get('date'), e.get('start'), e.get('end'),
                               normalize_space(e.get('subject')).casefold(), normalize_space(e.get('location')).casefold(),
                               e.get('type'), e.get('half') or '') for e in events}
                preserved = 0
                for old_event in previous_course['events']:
                    if str(old_event.get('sourceUrl') or '') not in failed_urls:
                        continue
                    key = (old_event.get('group'), old_event.get('stream'), old_event.get('date'), old_event.get('start'), old_event.get('end'),
                           normalize_space(old_event.get('subject')).casefold(), normalize_space(old_event.get('location')).casefold(),
                           old_event.get('type'), old_event.get('half') or '')
                    if key not in fresh_keys:
                        events.append(old_event); fresh_keys.add(key); preserved += 1
                if preserved:
                    print(f'SPECIALIST_LAST_GOOD_SOURCE_PRESERVED program={code} course={course} events={preserved} failed_sources={len(failed_urls)}', file=sys.stderr)
            # Cross-source exact dedupe before merging so semester + first-week PDFs don't double-render week one.
            unique: dict[tuple, dict] = {}
            for event in events:
                key = (event['group'], event.get('stream'), event['date'], event['start'], event['end'], event['subject'].casefold(), event['location'].casefold(), event.get('teacher','').casefold(), event['type'], event.get('half') or '')
                unique.setdefault(key, event)
            events = legacy.merge_consecutive_identical_events(list(unique.values()))
            source_records = [{'kind': rec['meta']['kind'], 'stream': rec['meta'].get('stream') or '', 'title': rec['meta']['title'], 'url': rec['meta']['url'], 'format': rec['meta']['format'], 'events': len(rec['events']), 'status': 'published'} for rec in recs]
            if source_errors:
                source_records.extend({'kind': x['kindHint'], 'title': x['title'], 'url': x['url'], 'status': 'quarantined', 'error': x['error']} for x in source_errors)
            if events:
                status = 'partial' if source_errors else 'live'
                courses[str(course)] = {'status': status, 'program': code, 'course': course, 'events': sorted(events, key=lambda e: (e['date'], e['start'], e['group'], e['subject'])),
                                         'sources': source_records, 'issues': [x['error'] for x in source_errors], 'sourceUrl': source_records[0]['url'] if source_records else PAGE,
                                         'sourceName': ' · '.join(x['title'] for x in source_records if x.get('status') == 'published'),
                                         'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
            elif (code, course) in discovered_courses and isinstance(previous_course.get('events'), list) and previous_course['events']:
                # A failed source must not overwrite the last known-good course payload with []
                courses[str(course)] = {**previous_course, 'status': 'cache', 'issues': [x['error'] for x in source_errors] or ['Источник временно недоступен; сохранён последний валидный snapshot.']}
                print(f"SPECIALIST_LAST_GOOD_USED program={code} course={course} events={len(previous_course['events'])}", file=sys.stderr)
            elif (code, course) in discovered_courses:
                raise RuntimeError(f"No valid events for published program/course {code}/{course}; keeping current release from being overwritten.")
            elif isinstance(previous_course.get('events'), list) and previous_course['events']:
                # Page template changes can temporarily hide a previously published
                # course link. Keep its exact last-known-good data, but label it cache.
                courses[str(course)] = {**previous_course, 'status': 'cache',
                    'issues': list(previous_course.get('issues', [])) + ['SOURCE_LINK_NOT_DISCOVERED; last known-good course snapshot preserved.']}
                print(f'SPECIALIST_LAST_GOOD_COURSE_PRESERVED program={code} course={course} events={len(previous_course["events"])}', file=sys.stderr)
            else:
                courses[str(course)] = {'status': 'unpublished', 'program': code, 'course': course, 'events': [], 'sources': [], 'issues': [],
                                         'sourceUrl': PAGE, 'sourceName': 'Официальный источник расписания пока не опубликован.'}
        programs[code] = {'title': details['title'], 'courses': courses}
    return {'schemaVersion': 1, 'dataState': 'live-generated', 'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'sourcePage': PAGE, 'programs': programs, 'diagnostics': {'discovered': len(candidates), 'parsedSources': len(parsed_by_key), 'quarantinedSources': len(failures)}}


def main() -> int:
    use_last_good = '--use-last-good' in sys.argv
    previous = load_last_good() if use_last_good else None
    session = legacy.session()
    try:
        payload = build_payload(session, previous)
    except Exception as error:
        # The workflow may use the last good file but must never publish an empty replacement.
        if use_last_good and previous:
            print(f"SPECIALIST_SYNC_FAILED_KEEP_LAST_GOOD: {error}", file=sys.stderr)
            return 0
        print(f"SPECIALIST_SYNC_FAILED: {error}", file=sys.stderr)
        return 1
    if not payload.get('programs'):
        print('SPECIALIST_SYNC_FAILED: generated payload is empty; refusing write', file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(OUT)
    total = sum(len(c.get('events', [])) for p in payload['programs'].values() for c in p['courses'].values())
    print(json.dumps({'ok': True, 'generatedAt': payload.get('generatedAt'), 'sources': payload.get('diagnostics', {}), 'events': total,
                      'courses': {code: {k: {'status': v['status'], 'events': len(v.get('events', []))} for k, v in p['courses'].items()} for code, p in payload['programs'].items()}}, ensure_ascii=False, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
