#!/usr/bin/env python3
"""Build a clearly non-production specialist schedule snapshot from reviewed official PDF text/rules.

This is an offline recovery helper. It intentionally leaves byte hashes and checkedAt empty;
its output MUST NOT satisfy the live production release gate. A normal live sync replaces it.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / 'data' / 'manual-specialist-schedules.json'
WEEKS = ROOT / 'data' / 'academic-weeks-2026-2027.json'
OUT = ROOT / 'data' / 'program-schedules.json'
URL_FALLBACK = 'https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/'
HOLIDAYS = {dt.date(2026, 11, 4), *[dt.date(2027, 1, n) for n in range(1, 9)]}


def week_numbers(spec: object) -> list[int]:
    text = str(spec or '').strip()
    if not text:
        return []
    nums: set[int] = set()
    for a, b in re.findall(r'(?<!\d)(\d{1,2})\s*[-–—]\s*(\d{1,2})(?!\d)', text):
        low, high = int(a), int(b)
        if low <= high:
            nums.update(range(low, high + 1))
    residual = re.sub(r'(?<!\d)\d{1,2}\s*[-–—]\s*\d{1,2}(?!\d)', ' ', text)
    nums.update(int(n) for n in re.findall(r'(?<!\d)\d{1,2}(?!\d)', residual))
    return sorted(n for n in nums if 1 <= n <= 52)


def target_date(week: dict, js_weekday: object) -> dt.date | None:
    try:
        start = dt.date.fromisoformat(week['from'])
        end = dt.date.fromisoformat(week['to'])
        wd = int(js_weekday)
    except (KeyError, TypeError, ValueError):
        return None
    if wd < 0 or wd > 6:
        return None
    # Rules use JavaScript Date.getDay(): Sunday=0, Monday=1, ... Saturday=6.
    start_js = (start.weekday() + 1) % 7
    target = start + dt.timedelta(days=(wd - start_js) % 7)
    if target > end or target in HOLIDAYS:
        return None
    return target


def event_id(row: dict) -> str:
    key = '|'.join(str(row.get(k, '')) for k in ('program','course','group','date','start','end','subject','location','type','weekNumber'))
    return hashlib.sha1(key.encode('utf-8')).hexdigest()[:14]


def build() -> dict:
    rules = json.loads(RULES.read_text(encoding='utf-8'))
    calendar = json.loads(WEEKS.read_text(encoding='utf-8'))
    if rules.get('academicYear') != '2026/2027' or calendar.get('academicYear') != '2026/2027':
        raise SystemExit('Recovery build requires 2026/2027 reviewed rule/calendar inputs.')
    week_map = {int(w['weekNumber']): w for w in calendar.get('weeks', [])}
    if calendar.get('status') not in ('live-verified', 'web-text-reviewed-byte-unverified') or len(week_map) < 20:
        raise SystemExit('Academic week calendar is missing/incomplete; refusing to invent schedule dates.')
    generated = dt.datetime.now(dt.timezone.utc).isoformat()
    programs: dict[str, dict] = {}
    totals = {'events': 0, 'rulesExpanded': 0, 'rulesDropped': 0, 'unverifiedSources': 0}
    warnings: list[dict] = []

    for code, program in rules.get('programs', {}).items():
        course_rows: dict[str, dict] = {}
        for course_num in range(1, 7):
            course_key = str(course_num)
            spec = program.get('courses', {}).get(course_key)
            if not spec:
                course_rows[course_key] = {'status':'unpublished','program':code,'course':course_num,'events':[],
                    'sources':[],'issues':['No course rules have been sourced from the official hub.'],
                    'message':'Для этого курса нет подтверждённого опубликованного расписания в доступном каталоге.'}
                continue
            sources = spec.get('sources', {})
            events: list[dict] = []
            dropped: list[dict] = []
            course_placement_total = 0
            for field, kind in (('lectureRules','lecture'), ('practiceRules','practice')):
                source_url = sources.get('lecture' if kind == 'lecture' else 'practice')
                source_title = (Path(source_url.split('?')[0]).name if source_url else f'{program.get("name")} · {course_num} курс · {kind}')
                for rule_index, rule in enumerate(spec.get(field, [])):
                    weeks = week_numbers(rule.get('weeks'))
                    if not weeks:
                        dropped.append({'ruleIndex':rule_index,'field':field,'reason':'week_spec_empty_or_unrecognized'})
                        continue
                    raw_groups = rule.get('groups')
                    if raw_groups:
                        groups = [str(g) for g in raw_groups]
                    elif str(rule.get('audience','')).upper() == 'ALL':
                        groups = ['ALL']
                    else:
                        dropped.append({'ruleIndex':rule_index,'field':field,'reason':'group_scope_missing'})
                        continue
                    for week_no in weeks:
                        week = week_map.get(week_no)
                        if not week:
                            dropped.append({'ruleIndex':rule_index,'field':field,'weekNumber':week_no,'reason':'week_not_in_official_calendar'})
                            continue
                        date = target_date(week, rule.get('weekday'))
                        if not date:
                            dropped.append({'ruleIndex':rule_index,'field':field,'weekNumber':week_no,'reason':'weekday_outside_calendar_or_official_holiday'})
                            continue
                        for group in groups:
                            start = str(rule.get('start') or '')
                            end = str(rule.get('end') or '')
                            if not re.fullmatch(r'\d{2}:\d{2}', start) or not re.fullmatch(r'\d{2}:\d{2}', end) or start >= end:
                                dropped.append({'ruleIndex':rule_index,'field':field,'weekNumber':week_no,'reason':'invalid_time_range'})
                                continue
                            event = {
                                'program':code,'course':course_num,'group':group,'stream':None,
                                'date':date.isoformat(),'start':start,'end':end,
                                'subject':str(rule.get('subject') or '').strip(),
                                'location':str(rule.get('location') or '').strip(),'teacher':str(rule.get('teacher') or '').strip(),
                                'type':kind,'half':None,'double':False,'orgMerged':False,'mergedConsecutive':False,
                                'durationMinutes':(int(end[:2])*60+int(end[3:]))-(int(start[:2])*60+int(start[3:])),
                                'weeks':f'нед. {week_no}','weekNumber':week_no,
                                'weekRangeStart':week['from'],'weekRangeEnd':week['to'],
                                'weekday':int(rule.get('weekday')) if str(rule.get('weekday','')).isdigit() else None,
                                'weekCalendarSource':calendar.get('source',{}).get('url'),
                                'weekCalendarStatus':calendar.get('status'),
                                'sourceUrl':source_url,'sourceTitle':source_title,'sourceKind':'official-pdf-web-text-rule',
                                'sourceVerification':'web-text-reviewed-byte-unverified','confidence':0.78,
                                'parser':'reviewed-official-pdf-text-recovery-rules-v1',
                            }
                            if code == '31.05.02' and course_num == 2 and kind == 'lecture':
                                event['sourceMetadataException'] = 'OFFICIAL_PEDS2_LECTURE_TITLE_MISLABEL'
                            event['id'] = f'{code}-{course_num}-{group}-{date.isoformat()}-{start.replace(":","")}-{event_id(event)}'
                            events.append(event)
                            totals['rulesExpanded'] += 1
                            course_placement_total += 1
            # Stable dedupe prevents overlapping manually curated rules from rendering twice.
            dedup = {}
            for event in events:
                key = (event['program'],event['course'],event['group'],event['date'],event['start'],event['end'],event['subject'].casefold(),event['location'].casefold(),event['type'])
                dedup.setdefault(key, event)
            events = sorted(dedup.values(), key=lambda e:(e['date'],e['start'],e['group'],e['subject']))
            kind_rows = []
            for source_kind in ('kug','lecture','practice'):
                url = sources.get(source_kind)
                if not url:
                    continue
                row = {
                    'kind':source_kind,'stream':'','title':Path(url.split('?')[0]).name,'url':url,
                    'status':'web-text-reviewed-byte-unverified','sha256':None,'contentBytes':None,'checkedAt':None,
                    'academicYearInDocument':'2026/2027' if source_kind != 'kug' else None,
                    'verificationChannel':'official student hub link and web-rendered PDF text reviewed; raw bytes not available to this runtime',
                    'events':sum(1 for e in events if e.get('sourceUrl') == url),
                }
                if code == '31.05.02' and course_num == 2 and source_kind == 'lecture':
                    row['metadataException'] = {'code':'OFFICIAL_PEDS2_LECTURE_TITLE_MISLABEL','expectedProgram':'31.05.02','documentHeaderProgram':'31.05.01',
                        'evidence':'Official student-hub link is under Pediatrics; body shows course 2, Flow A and groups 201П–203П. Header mismatch preserved as a warning.'}
                kind_rows.append(row)
            status = 'partial' if events else 'unpublished'
            issue_list = ['LOCAL_RECOVERY_SNAPSHOT','SOURCE_BYTES_AND_SHA256_NOT_VERIFIED','NOT_FOR_PRODUCTION']
            if dropped:
                issue_list.append(f'{len(dropped)} manual schedule placements excluded; see diagnostics.droppedPlacements')
            if code == '31.05.02' and course_num == 2:
                issue_list.append('OFFICIAL_PEDS2_LECTURE_TITLE_MISLABEL: header says 31.05.01, but hub link/body groups show Pediatrics 201П–203П')
            course_rows[course_key] = {
                'status':status,'program':code,'course':course_num,'events':events,'sources':kind_rows,
                'issues':issue_list,'sourceUrl':URL_FALLBACK,'sourceName':f'{program.get("name")} · {course_num} курс',
                'generatedAt':generated,'diagnostics':{'expandedRulePlacements':course_placement_total,'droppedPlacements':len(dropped)},
            }
            totals['events'] += len(events)
            totals['unverifiedSources'] += sum(1 for x in kind_rows if x['status'] != 'published')
            if dropped:
                warnings.append({'program':code,'course':course_num,'droppedPlacements':dropped})
        programs[code] = {'title':program.get('name',code),'courses':course_rows}

    result = {
        'schemaVersion':1,'dataState':'local-recovery-snapshot','generatedAt':generated,
        'sourcePage':URL_FALLBACK,'academicYear':'2026/2027','programs':programs,
        'diagnostics':{'mode':'offline-recovery','sourceBytesDownloaded':0,'unverifiedSources':totals['unverifiedSources'],
            'quarantinedSources':0,'manualRulePlacementsAttempted':totals['rulesExpanded'],
            'eventsEmittedBeforeDedupCount':totals['rulesExpanded'],'eventsPublishedAsLocalRecovery':totals['events'],
            'droppedPlacements':sum(len(w['droppedPlacements']) for w in warnings),
            'warnings':warnings,
            'limitations':['Not live-generated; all source PDF SHA-256 hashes are null.','Use npm run sync:official in a networked release runner to replace this recovery snapshot.',
                'This file must not be used to satisfy the production release gate.']}
    }
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'output':str(OUT),'dataState':result['dataState'],'courses':sum(len(p['courses']) for p in programs.values()),
        'events':totals['events'],'unverifiedSources':totals['unverifiedSources'],'droppedPlacements':result['diagnostics']['droppedPlacements'],
        'peds2LectureEvents':len(programs['31.05.02']['courses']['2']['events'])},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    build()
