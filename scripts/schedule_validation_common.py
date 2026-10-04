"""Shared structural invariants for generated/bootstrap schedule data."""
from __future__ import annotations
import datetime
import re

_VALID_TYPES = {"lecture", "practice"}
_LEADING_LOCATION_RE = re.compile(
    r'^(?:ауд\.?\s+|каб\.?\s+|зал\s+|ул\.\s+|просп?\.?\s+'
        r'|ЛРК\b|КПК\b|ЦДТИ\b|АСЦ\b|ШКОЛА\b|Солнечное\b|База\b|Пархоменко\b'
        r'|ПЦ\b|МНТК\b|КВД\b|ИМО\b|ДЛРК\b|РНХИ\b|СПБ\b|НМИЦ\b|НИИ\b|ФГБНУ\b)',
    re.I,
)
_CLOCK_RE = re.compile(r'^\d{2}:\d{2}$')
_GROUP_RE = re.compile(r'^\d{3}$')
_SUSPICIOUS_LOCATION_TAIL_RE = re.compile(
    r'(?:\b(?:ауд|каб)\.?\s*[A-Za-zА-Яа-я0-9./№-]+|(?:^|[,;]\s*)[A-Za-zА-Яа-я]?\d+[./][A-Za-zА-Яа-я0-9./№-]+)\s+'
    r'[А-ЯЁA-Z][А-ЯЁа-яёA-Za-z-]{1,}(?:\s+[А-ЯЁа-яёA-Za-z-]{1,}){0,8}$',
    re.I,
)


def suspicious_location_tail_warnings(data: dict) -> list[str]:
    """Warn when a room number is followed by subject-like text.

    These are intentionally warnings, not hard validation errors: some official
    PDF exports concatenate a following activity/subject into the same extracted
    location string, and correcting it without the raw source risks inventing data.
    """
    warnings = []
    for cid, course in (data.get('courses') or {}).items():
        for idx, event in enumerate(course.get('events') or []):
            loc = str(event.get('location', '') or '').strip()
            if _SUSPICIOUS_LOCATION_TAIL_RE.search(loc):
                warnings.append(
                    f"{cid}[{idx}]: suspicious location tail after room for {event.get('subject')!r}: {loc!r}"
                )
    return warnings


def _minutes(value: str) -> int:
    h, m = map(int, str(value).split(':'))
    return h * 60 + m


def calendar_consistency_errors(data: dict) -> list[str]:
    errors = []
    for cid, course in (data.get('courses') or {}).items():
        for idx, event in enumerate(course.get('events') or []):
            wd = event.get('weekday')
            ws = event.get('weekStart')
            date = event.get('date')
            if wd is None or not ws or not date:
                continue
            try:
                expected = (
                    datetime.date.fromisoformat(str(ws))
                    + datetime.timedelta(days=int(wd))
                ).isoformat()
            except Exception:
                continue
            if str(date) != expected:
                errors.append(f'{cid}[{idx}]: date {date!r} != {expected!r}')
    return errors


def bootstrap_event_errors(data: dict) -> list[str]:
    """Validate event shape even while roster completeness is deferred."""
    errors = []
    seen_by_course = {}
    for cid, course in (data.get('courses') or {}).items():
        if not isinstance(course, dict):
            errors.append(f'{cid}: course is not an object')
            continue
        events = course.get('events')
        if not isinstance(events, list):
            errors.append(f'{cid}: events is not a list')
            continue
        seen = set()
        seen_by_course[cid] = seen
        for idx, event in enumerate(events):
            p = f'{cid}[{idx}]'
            if not isinstance(event, dict):
                errors.append(f'{p}: event is not an object')
                continue
            typ = event.get('type')
            if typ not in _VALID_TYPES:
                errors.append(f'{p}: invalid type {typ!r}')
            stream = str(event.get('stream', '') or '')
            if str(cid) != '6' and stream not in {'A', 'B'}:
                errors.append(f'{p}: invalid stream {stream!r}')
            if str(cid) == '6' and stream != '':
                errors.append(f'{p}: course 6 must have empty stream, got {stream!r}')
            if typ == 'practice' and not _GROUP_RE.fullmatch(str(event.get('group', ''))):
                errors.append(f'{p}: practice group is not 3-digit')
            if typ == 'lecture' and event.get('group') != 'ALL':
                errors.append(f'{p}: lecture group must be ALL')
            wd = event.get('weekday')
            if wd is not None and (not isinstance(wd, int) or wd not in range(7)):
                errors.append(f'{p}: invalid weekday {wd!r}')
            if wd is None and typ != 'practice':
                errors.append(f'{p}: only practice may omit weekday')
            if typ == 'practice' and wd is None and event.get('scheduleMode') != 'weekly-block' and str(cid) in {'4', '5', '6'}:
                errors.append(f'{p}: weekly practice without weekday must be weekly-block')
            start, end = event.get('start'), event.get('end')
            if not _CLOCK_RE.fullmatch(str(start)) or not _CLOCK_RE.fullmatch(str(end)):
                errors.append(f'{p}: non-canonical time {start!r}-{end!r}')
            else:
                try:
                    duration = _minutes(end) - _minutes(start)
                    if duration <= 0 or duration > 240:
                        errors.append(f'{p}: invalid duration {duration} minutes')
                except Exception:
                    errors.append(f'{p}: unparsable time {start!r}-{end!r}')
            wk = event.get('weekNumber')
            if not isinstance(wk, int) or wk < 1 or wk > 52:
                errors.append(f'{p}: invalid weekNumber {wk!r}')
            sub = str(event.get('subject', '') or '').strip()
            if not sub:
                errors.append(f'{p}: empty subject')
            if _LEADING_LOCATION_RE.match(sub):
                errors.append(f'{p}: location leaked into subject {sub!r}')
            if 'жизнидеятельност и' in sub.lower():
                errors.append(f'{p}: known PDF wrap typo remains in subject {sub!r}')
            if event.get('double'):
                if event.get('doubleIndex') not in {1, 2}:
                    errors.append(f'{p}: invalid doubleIndex {event.get("doubleIndex")!r}')
                if not event.get('doubleOf'):
                    errors.append(f'{p}: double event missing doubleOf')
                if event.get('durationMinutes') not in {85, 95}:
                    errors.append(f'{p}: invalid double durationMinutes {event.get("durationMinutes")!r}')
            key = (
                typ, stream, event.get('group'), wk, event.get('date'), wd,
                event.get('start'), event.get('end'), event.get('subject'), event.get('location')
            )
            if key in seen:
                errors.append(f'{p}: exact duplicate event')
            seen.add(key)
    return errors
