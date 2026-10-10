#!/usr/bin/env python3
"""Fail-closed production gate for a live, source-hashed 2026/2027 release.

This gate is intentionally stricter than offline QA. It checks current fetched
bytes, academic-year identity, every known LD group/stream, every published
specialist-course roster, and all ten official KUG documents before deployment.
"""
from __future__ import annotations
import json
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = 'https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/'
EXPECTED_KUG = {('31.05.01', c) for c in range(1, 7)} | {('31.05.02', c) for c in (1, 2)} | {('37.05.01', c) for c in (1, 2)}
HASH_RE = re.compile(r'^[0-9a-f]{64}$')
MAX_AGE = timedelta(hours=36)


def read_json(rel: str, root: Path = ROOT):
    return json.loads((root / rel).read_text(encoding='utf-8'))


def parse_ts(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)
        return result.astimezone(timezone.utc)
    except ValueError:
        return None


def provenance_errors(row: dict, label: str, now: datetime) -> list[str]:
    errs = []
    if not HASH_RE.fullmatch(str(row.get('sha256', ''))):
        errs.append(f'{label}: missing/invalid SHA-256')
    if not isinstance(row.get('contentBytes'), int) or row['contentBytes'] < 500:
        errs.append(f'{label}: source byte count missing or suspiciously small')
    checked = parse_ts(row.get('checkedAt'))
    if not checked:
        errs.append(f'{label}: checkedAt missing/invalid')
    elif checked > now + timedelta(minutes=5) or now - checked > MAX_AGE:
        errs.append(f'{label}: source hash older than 36h or timestamp is in the future')
    if row.get('academicYearInDocument') != '2026/2027':
        errs.append(f'{label}: document does not state academic year 2026/2027')
    return errs


def expected_group_ids(roster: dict, course: str, stream: str) -> set[str]:
    return {str(v) for v in roster.get(course, {}).get(stream, [])}


def validate(root: Path = ROOT, *, now: datetime | None = None) -> list[str]:
    now = now or datetime.now(timezone.utc)
    errors: list[str] = []
    required = {
        'ld snapshot': 'data/official-schedules.json',
        'sync status': 'data/official-sync-status.json',
        'group roster contract': 'data/official-roster-contract.json',
        'KUG periods': 'data/kug.json',
        'KUG source manifest': 'data/kug-source-manifest.json',
        'official academic week calendar': 'data/academic-weeks-2026-2027.json',
        'Pediatrics/Clinical Psychology snapshot': 'data/program-schedules.json',
        'specialist roster contract': 'data/manual-specialist-schedules.json',
    }
    missing = [f'{label}: missing {rel}' for label, rel in required.items() if not (root / rel).is_file()]
    if missing:
        return ['required release artifacts unavailable; live sync is incomplete', *missing]
    loaded = {}
    for label, rel in required.items():
        try:
            loaded[label] = read_json(rel, root)
        except Exception as exc:
            errors.append(f'{label}: unreadable {rel}: {type(exc).__name__}: {exc}')
    if errors:
        return errors
    ld = loaded['ld snapshot']
    status = loaded['sync status']
    roster = loaded['group roster contract']
    kug = loaded['KUG periods']
    kug_manifest = loaded['KUG source manifest']
    weeks = loaded['official academic week calendar']
    specialist = loaded['Pediatrics/Clinical Psychology snapshot']
    manual = loaded['specialist roster contract']

    if ld.get('schemaVersion') != 7 or ld.get('dataState') != 'live-generated':
        errors.append('LD snapshot is not schemaVersion 7 live-generated data')
    generated = parse_ts(ld.get('generatedAt'))
    if not generated or generated > now + timedelta(minutes=5) or now - generated > MAX_AGE:
        errors.append('LD snapshot generatedAt missing, future-dated, or older than 36h')
    if status.get('dataState') != 'live-generated' or status.get('status') not in ('ok', 'release-ready'):
        errors.append('official-sync-status.json does not declare successful live sync')

    for course in map(str, range(1, 7)):
        cdata = ld.get('courses', {}).get(course, {})
        if not cdata.get('events'):
            errors.append(f'LD course {course}: no events')
        source_rows = cdata.get('sources', [])
        expected_streams = roster.get(course, {})
        for stream, groups in expected_streams.items():
            stream_sources = [s for s in source_rows if str(s.get('stream') or '') == str(stream)]
            required_kinds = {'lecture', 'practice'}
            for kind in required_kinds:
                rows = [s for s in stream_sources if s.get('kind') == kind]
                if not rows:
                    errors.append(f'LD {course}/{stream or "common"}: missing {kind} source')
                for row in rows:
                    errors.extend(provenance_errors(row, f'LD {course}/{stream or "common"}/{kind} {row.get("url")}', now))
                    audit = row.get('dateLabelAudit') or {}
                    if audit.get('conflictingDateYears'):
                        if kind == 'practice' and any(e.get('scheduleMode') == 'weekly-block' and str(e.get('stream') or '') == str(stream) for e in cdata.get('events', [])):
                            if row.get('dateResolution') != 'official-week-calendar-2026-2027':
                                errors.append(f'LD {course}/{stream or "common"}: conflicting embedded dates not resolved via official week calendar')
                        else:
                            errors.append(f'LD {course}/{stream or "common"}/{kind}: conflicting embedded dates need resolution')
            stream_events = [e for e in cdata.get('events', []) if str(e.get('stream') or '') == str(stream)]
            for group in map(str, groups):
                group_events = [e for e in stream_events if str(e.get('group')) == group]
                if not any(e.get('type') == 'lecture' for e in group_events) and not any(e.get('type') == 'lecture' and str(e.get('group')).upper() == 'ALL' for e in stream_events):
                    # Common lecture events may be represented without stream; group-level list is checked below.
                    if not any(e.get('type') == 'lecture' and str(e.get('group')).upper() == 'ALL' for e in cdata.get('events', [])):
                        errors.append(f'LD {course}/{stream or "common"}/{group}: missing lecture coverage')
                practices = [e for e in stream_events if str(e.get('group')) == group and e.get('type') == 'practice']
                if not practices:
                    errors.append(f'LD {course}/{stream or "common"}/{group}: missing direct practice assignment')
                for event in practices:
                    if event.get('scheduleMode') == 'weekly-block':
                        matrix_week = event.get('matrixWeekNumber', event.get('weekNumber'))
                        calendar_week = event.get('calendarWeekNumber')
                        if (not isinstance(matrix_week, int) or not isinstance(calendar_week, int)
                                or calendar_week != matrix_week or event.get('weekCalendarOffset') != 0
                                or not event.get('weekRangeStart') or not event.get('weekRangeEnd')):
                            errors.append(f'LD {course}/{stream or "common"}/{group}: weekly block lacks verified direct matrix-week/calendar-week mapping')
                        else:
                            expected_week = next((w for w in weeks.get('weeks', []) if w.get('weekNumber') == calendar_week), None)
                            if not expected_week or event.get('weekRangeStart') != expected_week.get('from') or event.get('weekRangeEnd') != expected_week.get('to'):
                                errors.append(f'LD {course}/{stream or "common"}/{group}: weekly block date range mismatches official calendar week {calendar_week}')
                    else:
                        date = parse_ts(event.get('date') + 'T00:00:00+00:00') if isinstance(event.get('date'), str) else None
                        if not date:
                            errors.append(f'LD {course}/{stream or "common"}/{group}: dated practice without valid date')
        if any(str(e.get('sourceUrl', '')).startswith('fixture://') for e in cdata.get('events', [])):
            errors.append(f'LD course {course}: fixture:// event found in production payload')

    # Verify the separate all-program KUG manifest and calendar source.
    if kug_manifest.get('status') != 'live-verified' or kug_manifest.get('academicYear') != '2026/2027':
        errors.append('KUG source manifest is not live-verified for 2026/2027')
    actual_kug = {(str(x.get('program')), int(x.get('course', 0))) for x in kug_manifest.get('sources', [])}
    if actual_kug != EXPECTED_KUG:
        errors.append(f'KUG manifest coverage mismatch; missing={sorted(EXPECTED_KUG-actual_kug)}, extra={sorted(actual_kug-EXPECTED_KUG)}')
    for row in kug_manifest.get('sources', []):
        if row.get('discovery') != 'official-hub':
            errors.append(f'KUG {row.get("program")}/{row.get("course")}: URL was not discovered from current official hub')
        errors.extend(provenance_errors(row, f'KUG {row.get("program")}/{row.get("course")} {row.get("url")}', now))
        periods = kug.get(str(row.get('program')), {}).get(str(row.get('course')), [])
        if not periods:
            errors.append(f'KUG {row.get("program")}/{row.get("course")}: no periods in client data')
        if not any(p.get('kind') == 'study' for p in periods):
            errors.append(f'KUG {row.get("program")}/{row.get("course")}: no study period')
        if not any(p.get('kind') == 'assessment' for p in periods):
            errors.append(f'KUG {row.get("program")}/{row.get("course")}: no exam/attestation period')
        if any(p.get('from', '')[:4] not in ('2026', '2027') or p.get('to', '')[:4] not in ('2026', '2027') for p in periods):
            errors.append(f'KUG {row.get("program")}/{row.get("course")}: dates outside academic year 2026/2027')
    week_manifest = weeks.get('source', {})
    if weeks.get('status') != 'live-verified' or weeks.get('academicYear') != '2026/2027':
        errors.append('Academic week calendar is not live-verified for 2026/2027')
    errors.extend(provenance_errors(week_manifest, 'Academic week calendar', now))
    week_rows = weeks.get('weeks', [])
    nums = [w.get('weekNumber') for w in week_rows]
    if len(week_rows) < 20 or nums != list(range(1, len(nums) + 1)):
        errors.append(f'Academic week calendar incomplete/non-contiguous: {nums}')

    # Current student hub publishes the two specialist programmes for years 1–2 only.
    if specialist.get('schemaVersion') != 1 or specialist.get('dataState') != 'live-generated':
        errors.append('Specialist snapshot is not a fresh live-generated snapshot')
    specialist_gen = parse_ts(specialist.get('generatedAt'))
    if not specialist_gen or specialist_gen > now + timedelta(minutes=5) or now - specialist_gen > MAX_AGE:
        errors.append('Specialist snapshot generatedAt missing, future-dated, or older than 36h')
    programs = specialist.get('programs', {})
    for program in ('31.05.02', '37.05.01'):
        if program not in programs:
            errors.append(f'Specialist programme {program} missing')
            continue
        for course in (1, 2):
            cdata = programs[program].get('courses', {}).get(str(course), {})
            events = cdata.get('events', [])
            if cdata.get('status') != 'live' or not events:
                errors.append(f'Specialist {program}/{course}: course is not live or has no events')
            sources = cdata.get('sources', [])
            if any(x.get('status') == 'quarantined' for x in sources):
                errors.append(f'Specialist {program}/{course}: quarantined source remains')
            kinds = {x.get('kind') for x in sources if x.get('status') == 'published'}
            if not {'lecture', 'practice'}.issubset(kinds):
                errors.append(f'Specialist {program}/{course}: need published lecture and practice/seminar source, got {sorted(kinds)}')
            for row in sources:
                if row.get('status') != 'published':
                    continue
                errors.extend(provenance_errors(row, f'Specialist {program}/{course} {row.get("url")}', now))
                exception = row.get('metadataException')
                if exception:
                    allowed = (program == '31.05.02' and course == 2 and row.get('kind') == 'lecture'
                        and row.get('url') == 'https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_pediatry-osen-1.pdf'
                        and exception.get('code') == 'OFFICIAL_PEDS2_LECTURE_TITLE_MISLABEL'
                        and exception.get('expectedProgram') == '31.05.02'
                        and exception.get('documentHeaderProgram') == '31.05.01')
                    if not allowed:
                        errors.append(f'Specialist {program}/{course}: unapproved metadata exception {exception}')
            expected_groups = {str(g) for g in manual.get('programs', {}).get(program, {}).get('courses', {}).get(str(course), {}).get('groups', [])}
            event_groups = {str(e.get('group')) for e in events if str(e.get('group', '')).upper() != 'ALL'}
            missing_groups = sorted(expected_groups - event_groups)
            if missing_groups:
                # Lectures can be a shared ALL event, but every student still needs at least one group or shared event.
                has_shared = any(str(e.get('group', '')).upper() == 'ALL' for e in events)
                if not has_shared:
                    errors.append(f'Specialist {program}/{course}: missing groups {missing_groups}')
                else:
                    for group in missing_groups:
                        if not any(e.get('type') == 'lecture' and str(e.get('group', '')).upper() == 'ALL' for e in events):
                            errors.append(f'Specialist {program}/{course}/{group}: absent from parsed events')
            if not any(e.get('type') == 'lecture' for e in events):
                errors.append(f'Specialist {program}/{course}: no lecture events')
            if not any(e.get('type') in ('practice', 'seminar', 'lab', 'clinical') for e in events):
                errors.append(f'Specialist {program}/{course}: no practice/seminar events')
    if specialist.get('diagnostics', {}).get('quarantinedSources', 0):
        errors.append(f'Specialist snapshot reports quarantined source count={specialist["diagnostics"]["quarantinedSources"]}')
    return list(dict.fromkeys(errors))
    

def main() -> int:
    errors = validate()
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'status': 'release-ready' if not errors else 'BLOCKED_FOR_PRODUCTION',
              'errors': errors, 'checks': {'requiredKugProgramCourses': 10, 'academicYear': '2026/2027', 'hashAlgorithm': 'SHA-256', 'maxSourceAgeHours': 36}}
    report_path = ROOT / 'reports' / 'production-release-audit.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if errors:
        print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
