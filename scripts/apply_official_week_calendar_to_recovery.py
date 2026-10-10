#!/usr/bin/env python3
"""Attach reviewed official week ranges to recovered matrix blocks without inventing weekdays.

Does not change a weekly block into a dated lesson and does not upgrade local fixtures
or sources to a live-verified state.
"""
import json
from pathlib import Path
from datetime import date
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'/'official-schedules.json'
WEEKS=ROOT/'data'/'academic-weeks-2026-2027.json'

def main():
    payload=json.loads(DATA.read_text(encoding='utf-8'))
    cal=json.loads(WEEKS.read_text(encoding='utf-8'))
    if payload.get('dataState')!='local-recovery-snapshot' or cal.get('academicYear')!='2026/2027':
        raise SystemExit('Refusing to remap an unexpected payload/year.')
    week_map={int(w['weekNumber']):w for w in cal.get('weeks',[])}
    mapped=0; missing=[]; streams={}
    for course_key, course in payload.get('courses',{}).items():
        for event in course.get('events',[]):
            if event.get('scheduleMode')!='weekly-block': continue
            try: wn=int(event.get('weekNumber'))
            except (TypeError,ValueError):
                missing.append(f"{course_key}/{event.get('group')}: invalid weekNumber"); continue
            # The official matrices have a dedicated column 1 with the one-day label
            # 03.09.2025, which falls inside official academic week 1 (01–05 Sep 2026).
            # Column 2's 07.09.2025–12.09.2025 label aligns with official week 2.
            # This is a direct week-number mapping; embedded dates remain quarantined.
            # Do not synthesize a weekday or a concrete lesson date.
            calendar_wn = wn
            wk=week_map.get(calendar_wn)
            if not wk:
                missing.append(f"{course_key}/{event.get('group')}: matrix week {wn} maps to unavailable calendar week {calendar_wn}"); continue
            event['matrixWeekNumber']=wn
            event['calendarWeekNumber']=calendar_wn
            event['weekCalendarOffset']=0
            event['weekRangeStart']=wk['from']; event['weekRangeEnd']=wk['to']
            event['weekCalendarSource']=cal.get('source',{}).get('url')
            event['weekCalendarSha256']=cal.get('source',{}).get('sha256')
            event['weekCalendarStatus']=cal.get('status')
            event['date']=None; event['weekday']=None; event['weekDate']=None
            # Week boundaries are now the authoritative date range; the embedded
            # stale years are retained only in the source audit, never used as dates.
            mapped+=1
            key=f"{course_key}/{event.get('stream') or 'common'}"
            streams[key]=streams.get(key,0)+1
    for ckey, course in payload.get('courses',{}).items():
        for source in course.get('sources',[]):
            if any(e.get('scheduleMode')=='weekly-block' and str(e.get('stream') or '')==str(source.get('stream') or '') and e.get('type')=='practice' for e in course.get('events',[])):
                source['dateResolution']='official-week-calendar-2026-2027'
                source['calendarVerificationStatus']=cal.get('status')
                audit=source.get('dateLabelAudit') or {}
                if str(source.get('url','')).endswith(('4k_ld_a-26-27-na-sajt.pdf','4k_ld_b-26-27-na-sajt.pdf','5k_ld_a-26-27-na-sajt.pdf','5k_ld_b-26-27-na-sajt.pdf','6k_ld-26-27-na-sajt-1.pdf')):
                    audit.setdefault('conflictingDateYears',[2025])
                    audit['resolutionPolicy']='Matrix column numbers map directly to official academic-calendar week numbers. Column 1 labels 03.09.2025 (within official week 1: 01–05.09.2026); column 2 labels 07.09.2025–12.09.2025 (official week 2: 07–12.09.2026). Embedded dates remain quarantined and never become current lesson dates.'
                    source['matrixWeekOffset']=0
                    source['matrixWeekAlignment']='matrixWeekNumber = official calendarWeekNumber'
                    source['dateLabelAudit']=audit
    payload['recoveryNote']=(payload.get('recoveryNote','')+' Official week ranges attached to existing weekly-block records from the reviewed official 2026/2027 academic-week calendar; weekday/date was not inferred. Raw PDF bytes remain unverified in this runtime.').strip()
    DATA.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    report={'status':'local-recovery-only','mappedWeeklyBlocks':mapped,'byCourseStream':streams,'unmapped':missing,
            'calendarStatus':cal.get('status'),'calendarSha256':cal.get('source',{}).get('sha256'),
            'matrixWeekOffset':0,
            'alignmentEvidence':'matrix week 1 has a one-day 03.09.2025 label within official week 1 (01–05.09.2026); matrix week 2 labels 07.09.2025–12.09.2025 matching official week 2 (07–12.09.2026)',
            'productionEligible':False,'note':'Week ranges are reviewed from official PDF text, not binary-hash verified. Blocks remain undated and must not imply a weekday.'}
    out=ROOT/'reports'/'recovery-week-map-audit.json'; out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
