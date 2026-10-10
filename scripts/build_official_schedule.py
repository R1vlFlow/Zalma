#!/usr/bin/env python3
import json,re,sys,datetime
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
import fitz
import pdfplumber
from universal_schedule_ingest import sniff_format, decode_rows, parse_source_bytes
from source_integrity import source_provenance

PAGE='https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/'
OUT=Path('data/official-schedules.json')
SEMESTER_START=datetime.date(2026,8,31)
DAY_ALIASES={
    'пн':0,'понедельник':0,
    'вт':1,'вторник':1,
    'ср':2,'среда':2,
    'чт':3,'четверг':3,
    'пт':4,'пятница':4,
    'сб':5,'суббота':5,
    'вс':6,'воскресенье':6,
}
DAY_RE=re.compile(r'^(?:ПН|ВТ|СР|ЧТ|ПТ|СБ|ВС|ПОНЕДЕЛЬНИК|ВТОРНИК|СРЕДА|ЧЕТВЕРГ|ПЯТНИЦА|СУББОТА|ВОСКРЕСЕНЬЕ)\b',re.I)
TIME_RE=re.compile(r'(?<!\d)(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:.]\s*(\d{2})(?!\d)')
WEEK_RE=re.compile(r'\(([^()]*(?:\d)[^()]*)\)')
DATE_RE=re.compile(r'^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$')
GROUP_RE=re.compile(r'(?<!\d)(\d{3})(?:\s*[-–—]\s*(\d{3}))?(?!\d)')
ROSTER_CONTRACT_PATH=Path('data/official-roster-contract.json')
def load_roster_contract():
    if not ROSTER_CONTRACT_PATH.exists(): return {}
    raw=json.loads(ROSTER_CONTRACT_PATH.read_text(encoding='utf-8'))
    return {str(c):{str(st):[str(x) for x in gs] for st,gs in streams.items()} for c,streams in raw.items()}
ROSTER_CONTRACT=load_roster_contract()


def norm(s): return re.sub(r'\s+',' ',str(s or '').replace('\xa0',' ')).strip()
def course_from_text(s):
    m=re.search(r'(?:^|\s)([1-6])\s*курс',s,re.I); return int(m.group(1)) if m else None
def parse_time(s):
    m=TIME_RE.search(s)
    return (f'{int(m.group(1)):02d}:{m.group(2)}',f'{int(m.group(3)):02d}:{m.group(4)}') if m else None

def normalize_clock(value):
    """Normalize one HH:MM/ H:MM clock to the canonical HH:MM form."""
    m=re.fullmatch(r'\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*',str(value or ''))
    if not m: return None
    h,mi=int(m.group(1)),int(m.group(2))
    if not (0<=h<=23 and 0<=mi<=59): return None
    return f'{h:02d}:{mi:02d}'

def normalize_event_time(event):
    """Canonicalize event start/end before any structural validation."""
    start=normalize_clock(event.get('start'))
    end=normalize_clock(event.get('end'))
    if start is None or end is None:
        return False
    event['start'],event['end']=start,end
    return True


def _clock_minutes(value):
    h,m=map(int,str(value).split(':')); return h*60+m

def _clock_from_minutes(value):
    value=value%(24*60); return f'{value//60:02d}:{value%60:02d}'

ORG_SUBJECT_RE = re.compile(
    r"(?:\bОРГ\b|основы\s+российской\s+государственности)", re.I
)


def is_org_subject(value):
    """Recognize the official ORG subject without matching unrelated words."""
    text=norm(value or '')
    return bool(ORG_SUBJECT_RE.search(text))


def merge_consecutive_identical_events(events):
    """Merge contiguous equal lesson slots, including 3+ slot runs.

    Lesson identity includes program/course/group/stream/week/date, title,
    room, teacher, lesson type, source and explicit subgroup marker. A and B
    streams or explicit 1/2 and 2/2 halves therefore never collapse together.
    """
    def identity(e):
        values=[]
        for key in ('program','course','group','stream','weekNumber','weekStart','weekday',
                    'date','type','subject','location','teacher','sourceUrl','half'):
            value=e.get(key) or ''
            if key=='subject':
                value='__ORG__' if is_org_subject(value) else norm(value).casefold()
            elif isinstance(value,str):
                value=norm(value).casefold() if key in {'location','teacher','type'} else value
            values.append(str(value))
        return tuple(values)
    def minutes(e,key):
        value=str(e.get(key,''))
        return _clock_minutes(value) if re.fullmatch(r'\d{1,2}:\d{2}',value) else None
    ordered=sorted((dict(e) for e in events), key=lambda e:(identity(e),minutes(e,'start') if minutes(e,'start') is not None else 0,minutes(e,'end') if minutes(e,'end') is not None else 0))
    out=[]; i=0; merged_count=0; org_count=0
    while i < len(ordered):
        first=ordered[i]
        a1,b1=minutes(first,'start'),minutes(first,'end')
        first_duration=(b1-a1) if a1 is not None and b1 is not None else 0
        first_is_merged=bool(first.get('orgMerged') or first.get('mergedConsecutive'))
        first_valid_slot=45 <= first_duration <= 130
        first_valid_block=first_is_merged and first_duration > 130
        if a1 is None or b1 is None or b1<=a1 or not (first_valid_slot or first_valid_block):
            out.append(first); i+=1; continue
        merged_item=dict(first); j=i+1; last_end=b1; slot_count=max(1,int(first.get('mergedSlotCount') or (2 if first_is_merged else 1)))
        while j < len(ordered):
            second=ordered[j]
            a2,b2=minutes(second,'start'),minutes(second,'end')
            d2=(b2-a2) if a2 is not None and b2 is not None else 0
            second_is_merged=bool(second.get('orgMerged') or second.get('mergedConsecutive'))
            second_valid_slot=45 <= d2 <= 130
            second_valid_block=second_is_merged and d2 > 130
            if (identity(first)!=identity(second) or a2 is None or b2 is None
                    or b2<=a2 or not (second_valid_slot or second_valid_block)
                    or not (0 <= a2-last_end <= 20)):
                break
            merged_item['end']=second['end']
            last_end=b2; slot_count+=max(1,int(second.get('mergedSlotCount') or (2 if second_is_merged else 1))); j+=1
        if slot_count<2:
            out.append(first); i+=1; continue
        merged_item['double']=True
        merged_item['durationMinutes']=last_end-a1
        merged_item['mergedSlotCount']=slot_count
        for key in ('doubleIndex','doubleOf','doublePart'):
            merged_item.pop(key,None)
        if is_org_subject(first.get('subject')):
            merged_item['orgMerged']=True
            merged_item['doubleMergeReason']='ORG consecutive slots'
            org_count+=1
        else:
            merged_item['mergedConsecutive']=True
            merged_item['doubleMergeReason']='identical consecutive slots'
        merged_count+=slot_count-1
        out.append(merged_item); i=j
    if merged_count:
        print(f'PARSER_DOUBLE_MERGE merged_slots={merged_count} org_runs={org_count}',file=sys.stderr)
    return out

def merge_org_consecutive_events(events):
    """Backward-compatible alias for the generalized identical-slot merger."""
    return merge_consecutive_identical_events(events)

def expand_double_lesson_events(events):
    """Split known long blocks, except ORG which must stay one continuous card."""
    out=[]
    for e in events:
        try:
            a=_clock_minutes(e['start']); b=_clock_minutes(e['end']); duration=b-a
        except Exception as exc:
            print(f"PARSER_ANOMALY invalid_time source={e.get('sourceTitle','?')} group={e.get('group','?')} event={e.get('subject','?')!r}: {exc}",file=sys.stderr)
            out.append(e); continue
        if duration <= 0:
            print(f"PARSER_ANOMALY non_positive_duration group={e.get('group','?')} subject={e.get('subject','?')!r} start={e.get('start')} end={e.get('end')}",file=sys.stderr)
            out.append(e); continue
        if duration in {185,205} and is_org_subject(e.get('subject')):
            item=dict(e); item['orgMerged']=True; item['double']=True
            item['durationMinutes']=duration; item['doubleMergeReason']='ORG source long block'
            out.append(item); continue
        # Current Almazov exports use 09:00–12:25, 09:20–12:25 and
        # 13:30–16:55 as two equal slots with a 15-minute break.
        if duration in {185,205}:
            slot=(duration-15)//2
            first=dict(e); second=dict(e)
            parent=f"{e.get('group','ALL')}|{e.get('weekNumber','')}|{e.get('weekday','')}|{e.get('subject','')}|{e.get('location','')}|{e.get('start')}|{e.get('end')}"
            first.update({'end':_clock_from_minutes(a+slot),'double':True,'doubleIndex':1,'doubleOf':parent,'durationMinutes':slot})
            second.update({'start':_clock_from_minutes(a+slot+15),'double':True,'doubleIndex':2,'doubleOf':parent,'durationMinutes':slot})
            out.extend([first,second]); continue
        if duration >= 175:
            print(f"PARSER_ANOMALY long_block_requires_review duration_min={duration} group={e.get('group','?')} weekday={e.get('weekday','?')} date={e.get('date','?')} subject={e.get('subject','?')!r} time={e.get('start')}-{e.get('end')}; kept_as_single_event",file=sys.stderr)
        out.append(e)
    return out

def weekday_sort_value(value):
    """Return a total-order key for weekday values.

    Daily schedules use 0..6. Weekly-block practice events from the official
    4–6 course matrix intentionally use None because the source does not
    specify a weekday. None must sort after dated weekdays instead of being
    compared directly with integers (Python 3 raises TypeError).
    """
    if value is None:
        return 99
    try:
        return int(value)
    except (TypeError, ValueError):
        return 99

def event_sort_key(event):
    return (
        int(event.get('weekNumber', 999) or 999),
        weekday_sort_value(event.get('weekday')),
        str(event.get('start') or ''),
        str(event.get('group') or ''),
        str(event.get('subject') or ''),
    )
def parse_weeks(spec):
    nums=[]
    for a,b in re.findall(r'(\d+)\s*[-–—]\s*(\d+)',spec): nums.extend(range(int(a),int(b)+1))
    rest=re.sub(r'\d+\s*[-–—]\s*\d+','',spec)
    nums.extend(int(x) for x in re.findall(r'\d{1,2}',rest))
    return sorted(set(n for n in nums if 1<=n<=52))
def week_start(n): return (SEMESTER_START+datetime.timedelta(days=7*(int(n)-1))).isoformat()
def week_number_for_date(d): return ((d-SEMESTER_START).days//7)+1 if d>=SEMESTER_START else 1
def parse_date_hint(s):
    m=DATE_RE.match(norm(s));
    if not m: return None
    day,month,year=m.groups(); y=int(year) if year else (2026 if int(month)>=8 else 2027)
    if y<100: y += 2000
    try: return datetime.date(y,int(month),int(day))
    except ValueError: return None
def clean_location(s):
    s=norm(s).strip(' ,/;')
    # Official schedule PDFs can place the approving-officer footer directly
    # after the last room on the same extracted text line. It is document
    # metadata, not a location, and must never reach the student UI.
    s=re.split(r'\bЗаведующий\s+Отделом\s+организации\s+учебного\s+процесса\b',s,maxsplit=1,flags=re.I)[0]
    s=re.split(r'\"?_+\"?\s*\d{4}\s*г\.?$',s,maxsplit=1)[0]
    s=re.sub(r'\s*,\s*',', ',s)
    return s.strip(' ,/;')

def clean_subject(s):
    s=norm(s).strip(' ,/;')
    s=re.sub(r'^\d{3}\s+','',s)
    # Remove accidental page/header fragments.
    s=re.sub(r'^(?:День недели|Время|Дисциплина / Неделя|Место проведения)\s*','',s,flags=re.I)
    return s

LEADING_LOCATION_START_RE = re.compile(
    r'^(?:ауд\.?\s+|каб\.?\s+|зал\s+|ул\.\s+|просп?\.?\s+'
        r'|ЛРК\b|КПК\b|ЦДТИ\b|АСЦ\b|ШКОЛА\b|Солнечное\b|База\b|Пархоменко\b'
        r'|ПЦ\b|МНТК\b|КВД\b|ИМО\b|ДЛРК\b|РНХИ\b|СПБ\b|НМИЦ\b|НИИ\b|ФГБНУ\b)',
    re.I,
)
LEADING_LOCATION_END_RE = re.compile(
    r'(?:'
    r'ауд\.?\s*[A-Za-zА-Яа-я0-9./№-]+'
    r'|каб\.?\s*[A-Za-zА-Яа-я0-9./№-]+'
    r'|зал\s+(?:[«"“][^»"”]+[»"”]|[А-Яа-яA-Za-z0-9._/-]+)'
    r'|База\s+практической\s+подготовки\b'
    r'|(?:КПК|Башня|ШКОЛА|ЦДТИ|АСЦ|ПЦ|ЛРК|МНТК|КВД|ИМО|ДЛРК|РНХИ|НМИЦ|НИИ|ФГБНУ)\s*,\s*'
    r'(?:ауд\.?\s*[A-Za-zА-Яа-я0-9./№-]+|каб\.?\s*[A-Za-zА-Яа-я0-9./№-]+|[«"“][^»"”]+[»"”]|[А-Яа-яA-Za-z0-9._/-]+)'
    r'|(?:ЦДТИ|АСЦ|ШКОЛА|КПК|Башня|ПЦ|ЛРК|МНТК|КВД|ИМО|ДЛРК|РНХИ|НМИЦ|НИИ|ФГБНУ)\b'
    r')', re.I
)
LOCATION_END_RE = LEADING_LOCATION_END_RE

NEXT_SUBJECT_RE = re.compile(
    r'\b(?!(?:Солнечное|ЦДТИ|ШКОЛА|АСЦ|КПК|Средняя|ул|ауд|каб)\b)'
    r'[А-ЯЁA-Z][а-яёa-z]+(?:\s+[а-яёa-z0-9,./-]+){0,7}\s+\(',
    re.I,
)

def split_leading_location(text):
    """Separate a location accidentally prepended to a subject name."""
    text=norm(text).strip(' ,/;')
    if not text or not LEADING_LOCATION_START_RE.match(text):
        return text, ''
    ends=list(LEADING_LOCATION_END_RE.finditer(text))
    if not ends:
        return text, ''
    cut=ends[-1].end()
    suffix=text[cut:].strip(' ,/;')
    if len(suffix)<2 or not re.match(r'[А-ЯЁA-Z]', suffix):
        return text, ''
    prefix=clean_location(text[:cut])
    if not prefix:
        return text, ''
    return clean_subject(suffix), prefix

# The main split parser is defined alongside LOCATION_END_RE below, after the shared PDF helpers.

def group_header(page_text):
    text=norm(page_text)
    stream=None
    if re.search(r'поток\s*[БB]', text, re.I): stream='B'
    elif re.search(r'поток\s*[АA]', text, re.I): stream='A'
    # The authoritative group header is normally on the line containing both
    # "День недели" and "Время". Accept wrapped/newline variants as well.
    nums=[]
    m=re.search(r'День\s+недели\s+Время(.{0,500})', text, re.I|re.S)
    if m:
        nums=re.findall(r'(?<!\d)(\d{3})(?!\d)',m.group(1))
    if not nums:
        # Restrict fallback to the beginning of the document; room numbers later
        # in the PDF must never become student groups.
        nums=re.findall(r'(?<!\d)(\d{3})(?!\d)',text[:3500])
    # Filter obvious room/academic-year numbers. Official student groups are
    # course-prefixed 1xx..5xx numbers; course is validated later.
    return stream, list(dict.fromkeys(nums))

def text_lines(page):
    return [norm(x) for x in page.get_text('text').splitlines() if norm(x)]

def parse_lecture(doc, course, url, stream):
    events=[]
    for page in doc:
        lines=text_lines(page); day=None; date_hint=None; i=0
        while i<len(lines):
            line=lines[i]
            dm=DAY_RE.match(line)
            if dm:
                day=DAY_ALIASES[dm.group(0).split()[0].lower().rstrip('.,:')]
                i+=1
                continue
            d=parse_date_hint(line)
            if d:
                date_hint=d
                i+=1
                continue
            tm=parse_time(line)
            if not tm or day is None:
                i+=1; continue
            # In the official PDFs the subject may be on the same line as the
            # time (e.g. '9:00 – 10:35 Биология'). Preserve that inline text;
            # the previous parser silently discarded it and then treated the
            # following room line as the subject.
            inline=TIME_RE.sub('',line,count=1).strip(' -–—:')
            buf=[inline] if inline else []
            j=i+1
            while j<len(lines) and not parse_time(lines[j]) and not DAY_RE.match(lines[j]):
                # A date line starts a new dated block but is not itself an event.
                if parse_date_hint(lines[j]): break
                buf.append(lines[j]); j+=1
            text=norm(' '.join(buf))
            matches=list(WEEK_RE.finditer(text))
            if matches:
                location=clean_location(text[matches[-1].end():])
                prev=0
                for m in matches:
                    weeks=parse_weeks(m.group(1)); subject=clean_subject(text[prev:m.start()])
                    subject=re.sub(r'^[/,;\s]+|[/,;\s]+$','',subject)
                    if subject and weeks:
                        for w in weeks:
                            events.append({'weekday':day,'start':tm[0],'end':tm[1],'subject':subject,'location':location,'group':'ALL','stream':stream,'type':'lecture','weekNumber':w,'weekStart':week_start(w),'sourceUrl':url})
                    prev=m.end()
            elif text:
                # First-week lecture sheets use explicit calendar dates and do not
                # contain a (week) marker. Keep those events instead of silently dropping them.
                subject=''; location=''
                if len(buf)>=2:
                    subject=clean_subject(buf[0])
                    location=clean_location(' '.join(buf[1:]))
                elif len(buf)==1:
                    inline_text=clean_subject(buf[0])
                    # First try the canonical location-prefix splitter. This
                    # covers rows where PDF extraction places the full address
                    # before the subject (e.g. 'ул. Аккуратова ... зал "Павлов" Физическая культура...').
                    split_subject, split_location = split_leading_location(inline_text)
                    if split_location:
                        subject=split_subject
                        location=split_location
                    else:
                        # Some first-week rows put the room directly after the
                        # subject on the same line, e.g. 'История России КПК, ...'.
                        loc_marker=re.search(r'\b(?:КПК|АСЦ|ЦДТИ|ШКОЛА|Солнечное)\b|\bул\.',inline_text,re.I)
                        if loc_marker:
                            subject=clean_subject(inline_text[:loc_marker.start()])
                            location=clean_location(inline_text[loc_marker.start():])
                        else:
                            subject=inline_text
                if subject:
                    wk=week_number_for_date(date_hint) if date_hint else 1
                    expected_date=(datetime.date.fromisoformat(week_start(wk))+datetime.timedelta(days=day)).isoformat()
                    event_date=date_hint.isoformat() if date_hint and date_hint.isoformat()==expected_date else expected_date
                    events.append({'weekday':day,'start':tm[0],'end':tm[1],'subject':subject,'location':location,'group':'ALL','stream':stream,'type':'lecture','weekNumber':wk,'weekStart':week_start(wk),'date':event_date,'sourceUrl':url})
            i=j
    return events


def _add_practice_events_from_table(events, page, course, url, stream):
    """Fallback for table-based PDF extraction.

    PyMuPDF's coordinate text can vary substantially between PDF exports. The
    official practice sheets are tabular, so when coordinates do not expose a
    usable row/day relationship we ask MuPDF to reconstruct the table and parse
    the same cells semantically.
    """
    added=0
    try:
        finder=page.find_tables(strategy='lines')
        tables=list(getattr(finder,'tables',[]) or [])
    except Exception:
        tables=[]
    if not tables:
        try:
            finder=page.find_tables(strategy='text')
            tables=list(getattr(finder,'tables',[]) or [])
        except Exception:
            tables=[]
    prefix=str(course)
    for table in tables:
        try:
            rows=table.extract()
        except Exception:
            continue
        if not rows: continue
        header_i=None; group_cols={}
        for ri,row in enumerate(rows[:8]):
            vals=[norm(x) for x in (row or [])]
            for ci,v in enumerate(vals):
                m=re.fullmatch(rf'{re.escape(prefix)}\d{{2}}',v)
                if m: group_cols[v]=ci
            if len(group_cols)>=2:
                header_i=ri; break
        if header_i is None: continue
        current_day=None
        current_time=None
        for row in rows[header_i+1:]:
            vals=[norm(x) for x in (row or [])]
            if not vals: continue
            joined=' '.join(vals[:min(3,len(vals))])
            day=None
            for alias,num in DAY_ALIASES.items():
                if re.search(rf'\b{re.escape(alias)}\b',joined,re.I): day=num; break
            if day is not None: current_day=day
            time=parse_time(joined)
            if not time:
                for v in vals:
                    time=parse_time(v)
                    if time: break
            if time is not None:
                current_time=time
            else:
                time=current_time
            if time is None or current_day is None: continue
            for group,ci in group_cols.items():
                if ci>=len(vals): continue
                cell=norm(vals[ci])
                for subject,weeks,location in split_subjects(cell):
                    for wk in weeks:
                        events.append({'weekday':current_day,'start':time[0],'end':time[1],
                            'subject':subject,'location':location,'group':group,'stream':stream,
                            'type':'practice','weekNumber':wk,'weekStart':week_start(wk),'sourceUrl':url})
                        added+=1
    return added


def _add_practice_events_from_words_fallback(events, page, course, url, stream):
    """Second fallback: tolerate unusual text geometry and dual clocks."""
    words=page.get_text('words')
    toks=[(float(w[0]),float(w[1]),float(w[2]),float(w[3]),norm(w[4])) for w in words if norm(w[4])]
    prefix=str(course)
    headers=[w for w in toks if re.fullmatch(rf'{re.escape(prefix)}\d{{2}}',w[4])]
    if len(headers)<2: return 0
    unique=[]
    for g in sorted({w[4] for w in headers}, key=int):
        cand=[w for w in headers if w[4]==g]
        unique.append((g,min(cand,key=lambda x:x[1])))
    unique.sort(key=lambda x:x[1][0])
    centers=[(w[0]+w[2])/2 for _,w in unique]
    bounds=[]
    for i,c in enumerate(centers):
        left=(centers[i-1]+c)/2 if i else c-(centers[1]-c)/2
        right=(c+centers[i+1])/2 if i<len(centers)-1 else c+(c-centers[i-1])/2
        bounds.append((left,right))

    # Collapse the two official clocks printed on one row into one row object.
    clock_rows=[]
    for w in toks:
        m=TIME_RE.search(w[4])
        if not m: continue
        tm=(f'{int(m.group(1)):02d}:{m.group(2)}',f'{int(m.group(3)):02d}:{m.group(4)}')
        y=(w[1]+w[3])/2
        row=next((r for r in clock_rows if abs(r['y']-y)<=3),None)
        if row is None:
            row={'y':y,'clocks':[]}; clock_rows.append(row)
        if tm not in row['clocks']: row['clocks'].append(tm)
    # Some exports split a clock into three text objects: 09:00 / - / 10:35.
    # Reconstruct those rows from the left side when no complete clock was found.
    if not clock_rows:
        left_words=[w for w in toks if w[0] < centers[0]]
        buckets=[]
        for w in left_words:
            y=(w[1]+w[3])/2
            bucket=next((b for b in buckets if abs(b['y']-y)<=3),None)
            if bucket is None:
                bucket={'y':y,'words':[]}; buckets.append(bucket)
            bucket['words'].append(w)
        for bucket in buckets:
            row_text=norm(' '.join(w[4] for w in sorted(bucket['words'],key=lambda z:z[0])))
            clocks=[(f'{int(m.group(1)):02d}:{m.group(2)}',f'{int(m.group(3)):02d}:{m.group(4)}') for m in TIME_RE.finditer(row_text)]
            if clocks: clock_rows.append({'y':bucket['y'],'clocks':clocks})
    clock_rows.sort(key=lambda z:z['y'])
    if not clock_rows:return 0

    days=[]
    for w in toks:
        key=w[4].lower().rstrip('.,:')
        if key in DAY_ALIASES: days.append((w[1],DAY_ALIASES[key]))
    days.sort()
    added=0
    for idx,row in enumerate(clock_rows):
        y=row['y']
        prev=[d for d in days if d[0] <= y+2]
        if not prev: continue
        weekday=prev[-1][1]
        top=(clock_rows[idx-1]['y']+y)/2 if idx else y-18
        bottom=(y+clock_rows[idx+1]['y'])/2 if idx<len(clock_rows)-1 else y+30
        for (group,_), (left,right) in zip(unique,bounds):
            cell=[w for w in toks if left<=((w[0]+w[2])/2)<right and top<=w[1]<=bottom]
            text=norm(' '.join(w[4] for w in sorted(cell,key=lambda z:(z[1],z[0]))))
            text=re.sub(rf'^{re.escape(group)}\s*','',text)
            records=split_subjects(text)
            for subject,weeks,location in records:
                clocks=row['clocks']
                time_index=1 if 'город' in location.lower() and len(clocks)>1 else 0
                start,end=clocks[min(time_index,len(clocks)-1)]
                for wk in weeks:
                    events.append({'weekday':weekday,'start':start,'end':end,'subject':subject,'location':location,'group':group,'stream':stream,
                        'type':'practice','weekNumber':wk,'weekStart':week_start(wk),'sourceUrl':url})
                    added+=1
    return added

# PDF table parsing ---------------------------------------------------------
#
# The official Almazov practice PDFs are exported from spreadsheets. Their
# visible structure is a real grid: group columns, day rows, time rows and
# merged cells. Extracting the PDF as a flat stream of words loses that
# structure and is exactly what caused the old parser to miss large parts of
# the schedule. The primary parser below therefore uses pdfplumber's line
# table extraction and only falls back to the older coordinate parser when a
# future PDF export has no recoverable table grid.

PRACTICE_TABLE_SETTINGS = {
    'vertical_strategy': 'lines',
    'horizontal_strategy': 'lines',
    'intersection_tolerance': 5,
    'snap_tolerance': 3,
}

LOCATION_END_RE = re.compile(
    r'(?:'
    r'ауд\.?\s*[A-Za-zА-Яа-я0-9./№-]+'
    r'|каб\.?\s*[A-Za-zА-Яа-я0-9./№-]+'
    r'|зал\s+(?:[«"“][^»"”]+[»"”]|[А-Яа-яA-Za-z0-9._/-]+)'
    r'|База\s+практической\s+подготовки\b'
    r'|(?:КПК|Башня|ШКОЛА|ЦДТИ|АСЦ|ПЦ|ЛРК|МНТК|КВД|ИМО|ДЛРК|РНХИ|НМИЦ|НИИ|ФГБНУ)\s*,\s*'
    r'(?:ауд\.?\s*[A-Za-zА-Яа-я0-9./№-]+|каб\.?\s*[A-Za-zА-Яа-я0-9./№-]+|[«"“][^»"”]+[»"”]|[А-Яа-яA-Za-z0-9._/-]+)'
    r'|(?:ЦДТИ|АСЦ|ШКОЛА|КПК|Башня|ПЦ|ЛРК|МНТК|КВД|ИМО|ДЛРК|РНХИ|НМИЦ|НИИ|ФГБНУ)\b'
    r')', re.I
)

# A PDF export can wrap a word at the visual line boundary without a hyphen.
# Keep these corrections deliberately conservative: they repair observed
# official subject names without trying to perform general spell correction.
SUBJECT_PDF_ALIASES = {
    'жизнидеятельност и': 'жизнедеятельности',
    'жизнедеятельност и': 'жизнедеятельности',
    'государственност и': 'государственности',
    'Эндокрино логия': 'Эндокринология',
    'Пархоменк о': 'Пархоменко',
    'диагностик а': 'диагностика',
    'диагност ика': 'диагностика',
}


def repair_pdf_subject(text):
    text = clean_subject(text)
    for bad, good in SUBJECT_PDF_ALIASES.items():
        text = re.sub(re.escape(bad), good, text, flags=re.I)
    return text


def repair_subject_leaks_from_location(location, known_subjects):
    """Remove a subject accidentally concatenated after a numeric room label.

    This is deliberately conservative: a suffix is stripped only when it matches
    a known schedule subject (or an incomplete prefix of one) from the parsed
    official dataset. No location or subject is inferred from unrelated text.
    """
    value = clean_location(location)
    match = re.match(r'^(?P<base>.*(?:\b(?:ауд\.?\s*)?\d{1,2}[.,]\d{1,2}[А-ЯA-Zа-яa-z]?))\s+(?P<tail>[А-ЯЁA-Z].+)$', value, re.I)
    if not match:
        return value
    tail = repair_pdf_subject(match.group('tail'))
    folded = lambda x: re.sub(r'[^0-9a-zа-яё]+', ' ', norm(x).lower()).strip()
    tail_key = folded(tail)
    if len(tail_key) < 7 or len(tail_key.split()) < 2:
        return value
    for candidate in known_subjects:
        candidate_key = folded(repair_pdf_subject(candidate))
        if not candidate_key or candidate_key == folded(match.group('base')):
            continue
        if candidate_key == tail_key or candidate_key.startswith(tail_key + ' ') or tail_key.startswith(candidate_key + ' '):
            return clean_location(match.group('base'))
    return value


def split_practice_cell(text):
    """Return ``(subject, weeks, location)`` records from one practice cell.

    Handles compound cells with repeated week ranges and changed rooms, plus
    PDF exports where a location prefix is accidentally prepended to a subject.
    """
    text=norm(text)
    matches=list(WEEK_RE.finditer(text))
    if not matches: return []
    subjects=[]; leading_locations=[]; cursor=0; current_subject=None; current_leading_location=''
    for match in matches:
        before=text[cursor:match.start()].strip(' /,;')
        if current_subject is None:
            current_subject,current_leading_location=split_leading_location(before)
            current_subject=repair_pdf_subject(current_subject)
        else:
            ends=list(LOCATION_END_RE.finditer(before))
            suffix=before[ends[-1].end():].strip(' /,;') if ends else ''
            if not suffix:
                nm=NEXT_SUBJECT_RE.search(before)
                if nm: suffix=before[nm.start():].strip(' /,;')
            if suffix and re.search(r'[А-ЯЁA-Zа-яёa-z]{2,}',suffix):
                current_subject,current_leading_location=split_leading_location(suffix)
                current_subject=repair_pdf_subject(current_subject)
        subjects.append(current_subject); leading_locations.append(current_leading_location); cursor=match.end()
    records=[]
    for i,match in enumerate(matches):
        end=matches[i+1].start() if i+1<len(matches) else len(text)
        location=text[match.end():end].strip(' /,;')
        if i+1<len(matches):
            ends=list(LOCATION_END_RE.finditer(location))
            if ends:
                suffix=location[ends[-1].end():].strip(' /,;')
                if suffix and re.search(r'[А-ЯЁA-Zа-яёa-z]{2,}',suffix):
                    location=location[:ends[-1].end()]
            else:
                nm=NEXT_SUBJECT_RE.search(location)
                if nm: location=location[:nm.start()]
        location=clean_location(location)
        if leading_locations[i]: location=clean_location('; '.join(x for x in (leading_locations[i],location) if x))
        location=re.sub(r'\s+([.,])',r'\1',location)
        weeks=parse_weeks(match.group(1)); subject=repair_pdf_subject(subjects[i])
        if subject and weeks: records.append((subject,weeks,location))
    return records

split_subjects=split_practice_cell

def parse_dual_location_time(text, location):
    """Select the official clock for the location printed in a practice cell.

    The PDF prints two clocks on one row: Солнечное first, Город second.
    Official locations such as ЦДТИ/ШКОЛА/КПК/Башня are city-side locations and
    therefore use the second clock unless the cell explicitly says Солнечное.
    """
    clocks = [
        (f'{int(m.group(1)):02d}:{m.group(2)}', f'{int(m.group(3)):02d}:{m.group(4)}')
        for m in TIME_RE.finditer(text)
    ]
    if not clocks:
        return None
    low = location.lower()
    if 'солнечное' in low:
        return clocks[0]
    return clocks[1] if len(clocks) > 1 else clocks[0]


def extract_practice_table(page):
    """Extract the spreadsheet grid from an official practice PDF page."""
    try:
        tables = page.extract_tables(PRACTICE_TABLE_SETTINGS)
    except Exception:
        return []
    return [t for t in tables if t and max((len(r) for r in t), default=0) >= 4]


def parse_practice_tables(doc, course, url, stream):
    """Primary parser for official spreadsheet-style practice PDFs."""
    events = []
    group_columns = None
    current_day = None
    course_prefix = str(course)

    for page in doc:
        # pdfplumber expects a page object, not a PyMuPDF page. The caller passes
        # a small adapter created below; this function is intentionally isolated
        # from the rest of the parser.
        tables = extract_practice_table(page)
        if not tables:
            continue
        table = max(tables, key=lambda t: (len(t), max((len(r) for r in t), default=0)))

        # Re-detect group columns on every page that carries a header. Excel/PDF
        # exports can change the extracted cell indexes between pages because of
        # merged cells. Reusing the first page's indexes silently loses groups.
        page_group_columns = {}
        for row in table:
            for ci, value in enumerate(row or []):
                value = norm(value)
                if re.fullmatch(rf'{re.escape(course_prefix)}\d{{2}}', value):
                    page_group_columns[value] = ci
        if page_group_columns:
            group_columns = page_group_columns
        if not group_columns:
            continue

        for row in table:
            row = list(row or [])
            if len(row) <= 1:
                continue
            day_text = norm(row[0] if len(row) > 0 else '')
            day_key = day_text.lower().rstrip('.,:')
            if day_key in DAY_ALIASES:
                current_day = DAY_ALIASES[day_key]

            time_text = norm(row[1] if len(row) > 1 else '')
            if current_day is None or not TIME_RE.search(time_text):
                continue

            for group, ci in group_columns.items():
                if ci >= len(row):
                    continue
                cell = norm(row[ci])
                if not cell:
                    continue
                for subject, weeks, location in split_practice_cell(cell):
                    selected_time = parse_dual_location_time(time_text, location)
                    if not selected_time:
                        continue
                    start, end = selected_time
                    for week in weeks:
                        events.append({
                            'weekday': current_day,
                            'start': start,
                            'end': end,
                            'subject': subject,
                            'location': location,
                            'group': group,
                            'stream': stream,
                            'type': 'practice',
                            'weekNumber': week,
                            'weekStart': week_start(week),
                            'sourceUrl': url,
                            'parser': 'pdfplumber-grid-v2',
                        })
    return events


WEEK_HEADER_RE = re.compile(r'(?<!\d)([1-9]|[1-4]\d|5[0-2])(?!\d)')
MATRIX_LOCATION_MARKERS = re.compile(
    r'\b(?:КПК|Башня|Пархоменко|ПЦ|МНТК|КВД|ЛРК|ИМО|ДЛРК|РНХИ|СПБ|СПб|НМИЦ|НИИ|ФГБНУ|Обл\.?|ГБ\b|База|ауд\.?|каб\.?|зал\b|Родильный|Менделеевская|ул\.?|просп\.?|Звездная|Ногина|Поленов|Вредена|Больница|Госпиталь|ЦДТИ|ШКОЛА|АСЦ|С использованием ДОТ|Центр\s+Алмазова|Институт\s+мозга|ЛОПТД|ГПТД)\b',
    re.I
)

def split_matrix_cell(text):
    # Repair PDF line-wraps before searching for the first location marker.
    # Example from the real 4B sheet: `Эндокрино логия Пархоменк о, 5.12`.
    text = repair_pdf_subject(norm(text))
    if not text:
        return None, ''
    leading_subject, leading_location = split_leading_location(text)
    if leading_location:
        return leading_subject, clean_location(leading_location)
    m = MATRIX_LOCATION_MARKERS.search(text)
    if m:
        subject = repair_pdf_subject(text[:m.start()]).strip(' ,.-')
        location = clean_location(text[m.start():])
        if subject:
            return subject, location
    return repair_pdf_subject(text), ''

def _drawing_segments(page):
    """Return vector line segments from a PDF page, including rectangle edges."""
    vertical=[]; horizontal=[]
    for d in page.get_drawings():
        for item in d.get('items',[]):
            kind=item[0]
            if kind=='l':
                a,b=item[1],item[2]
                x1,y1=float(a.x),float(a.y); x2,y2=float(b.x),float(b.y)
                if abs(x2-x1)<=1.5 and abs(y2-y1)>3:
                    vertical.append((x1,min(y1,y2),max(y1,y2)))
                elif abs(y2-y1)<=1.5 and abs(x2-x1)>3:
                    horizontal.append((y1,min(x1,x2),max(x1,x2)))
            elif kind=='re':
                r=item[1]
                x0,y0,x1,y1=float(r.x0),float(r.y0),float(r.x1),float(r.y1)
                if x1-x0>3:
                    horizontal.extend([(y0,x0,x1),(y1,x0,x1)])
                if y1-y0>3:
                    vertical.extend([(x0,y0,y1),(x1,y0,y1)])
    return vertical,horizontal

def _cluster_numbers(values,tol=2.5):
    out=[]
    for v in sorted(values):
        if out and abs(v-out[-1])<=tol:
            out[-1]=(out[-1]+v)/2
        else: out.append(v)
    return out

def _words_from_pymupdf(page):
    out=[]
    for w in page.get_text('words'):
        if len(w)<5: continue
        text=norm(w[4])
        if not text: continue
        out.append({'x0':float(w[0]),'y0':float(w[1]),'x1':float(w[2]),'y1':float(w[3]),
                    'xc':(float(w[0])+float(w[2]))/2,'yc':(float(w[1])+float(w[3]))/2,'text':text})
    return out

def _header_week_centers(words, course):
    """Find week-number centers in the spreadsheet header.

    The 4–6 course PDFs are spreadsheet exports. Depending on the export version,
    the word ``Неделя`` can be on a different baseline from the numeric labels,
    and course 5B uses a ``Даты 1 2 3 ...`` header without the word ``Неделя``.
    Never make the parser depend on one exact baseline.
    """
    def numeric_band_candidates(limit_y=None):
        nums=[w for w in words
              if (limit_y is None or w['yc']<limit_y)
              and re.fullmatch(r'(?:[1-9]|[1-4]\d|5[0-2])',w['text'])]
        bands={}
        for w in nums:
            key=round(w['yc']/5)*5
            bands.setdefault(key,[]).append(w)
        out=[]
        for band in bands.values():
            by={}
            for w in band:
                by[int(w['text'])]=w
            if len(by)>=8: out.append(by)
        return out

    for h in [w for w in words if re.fullmatch(r'Неделя',w['text'],re.I)]:
        nums=[w for w in words if abs(w['yc']-h['yc'])<=18 and re.fullmatch(r'(?:[1-9]|[1-4]\d|5[0-2])',w['text'])]
        by={int(w['text']):w for w in nums}
        if len(by)>=8: return {k:by[k]['xc'] for k in sorted(by)}

    group_ys=[w['yc'] for w in words if re.fullmatch(rf'{int(course)}\d{{2}}',w['text'])]
    cutoff=min(group_ys)-12 if group_ys else None
    candidates=numeric_band_candidates(cutoff)
    if candidates:
        best=max(candidates,key=lambda by:(len(by),max(by)-min(by)))
        return {k:best[k]['xc'] for k in sorted(best)}

    candidates=numeric_band_candidates(None)
    if candidates:
        best=max(candidates,key=lambda by:(len(by),max(by)-min(by)))
        return {k:best[k]['xc'] for k in sorted(best)}
    return {}


def _matrix_text_blocks(words, x0, x1, y0, y1):
    selected=[w for w in words if w['xc']>x0+1 and w['xc']<x1-1 and w['yc']>y0+1 and w['yc']<y1-1]
    selected=[w for w in selected if not re.fullmatch(r'\d{3}',w['text'])]
    selected.sort(key=lambda w:(w['yc'],w['x0']))
    lines=[]
    for w in selected:
        if not lines or abs(w['yc']-lines[-1]['yc'])>4:
            lines.append({'yc':w['yc'],'words':[w]})
        else: lines[-1]['words'].append(w)
    blocks=[]
    for line in lines:
        ws=line['words']
        if ws:
            blocks.append({'x0':min(w['x0'] for w in ws),'x1':max(w['x1'] for w in ws),
                           'yc':line['yc'],'text':norm(' '.join(w['text'] for w in ws))})
    return blocks


def parse_week_matrix_text_fallback(doc_bytes, course, url, stream):
    """Fallback for intact text layers with incomplete spreadsheet borders."""
    events=[]
    with fitz.open(stream=doc_bytes,filetype='pdf') as doc:
        carry_wc={}; fixed_time=None
        for page in doc:
            words=_words_from_pymupdf(page)
            wc=_header_week_centers(words,course)
            if len(wc)>=8: carry_wc=wc
            else: wc=carry_wc
            if len(wc)<8: continue
            text=norm(page.get_text('text'))
            ft=re.search(r'Время\s+занятий\s+семинарского\s+типа\s*:?\s*(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})',text,re.I)
            if not ft:
                # Some PDF exports lose Cyrillic glyphs in the text layer while
                # preserving the clock. Never confuse dotted date ranges with
                # this fallback: a valid clock must contain a colon/dot pair.
                ft=re.search(r'(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})',text)
            if ft: fixed_time=(normalize_clock(ft.group(1)),normalize_clock(ft.group(2)))
            if not fixed_time or not all(fixed_time): continue
            groups=_group_centers(words,course)
            if not groups: continue
            centers=[wc[k] for k in sorted(wc)]
            diffs=[b-a for a,b in zip(centers,centers[1:]) if b>a]
            spacing=sorted(diffs)[len(diffs)//2] if diffs else 1
            table_left=min(centers)-spacing*0.75; table_right=max(centers)+spacing*0.75
            for gi,(group,gy) in enumerate(groups):
                prev_y=groups[gi-1][1] if gi else gy-40
                next_y=groups[gi+1][1] if gi+1<len(groups) else gy+40
                top=(prev_y+gy)/2; bottom=(gy+next_y)/2
                blocks=_matrix_text_blocks(words,table_left,table_right,top,bottom)
                merged=[]
                for b in blocks:
                    if merged and abs(b['yc']-merged[-1]['yc'])<=18 and b['x0']<merged[-1]['x1']+spacing*0.35:
                        merged[-1]['text']=norm(merged[-1]['text']+' '+b['text'])
                        merged[-1]['x0']=min(merged[-1]['x0'],b['x0']); merged[-1]['x1']=max(merged[-1]['x1'],b['x1'])
                        merged[-1]['yc']=(merged[-1]['yc']+b['yc'])/2
                    else: merged.append(dict(b))
                for b in merged:
                    subject,location=split_matrix_cell(b['text'])
                    if not subject or subject in {'Практика','Практика и элективы'}: continue
                    center=(b['x0']+b['x1'])/2
                    nearest=min(centers,key=lambda cx:abs(cx-center))
                    covered=[wk for wk,cx in wc.items() if abs(cx-nearest)<=spacing*0.51]
                    if b['x1']-b['x0']>spacing*0.95:
                        covered=[wk for wk,cx in wc.items() if b['x0']-spacing*0.12<=cx<=b['x1']+spacing*0.12]
                    for wk in sorted(set(covered)):
                        events.append({'weekday':None,'start':fixed_time[0],'end':fixed_time[1],
                            'subject':subject,'location':location,'group':str(group),'stream':stream or '',
                            'type':'practice','weekNumber':wk,'weekStart':week_start(wk),
                            'sourceUrl':url,'scheduleMode':'weekly-block','parser':'pymupdf-text-matrix-v3'})
    seen=set(); out=[]
    for e in events:
        k=(e['group'],e['weekNumber'],e['subject'],e['location'],e['start'],e['end'])
        if k not in seen: seen.add(k); out.append(e)
    return out

def _group_centers(words, course):
    rx=re.compile(rf'^{int(course)}\d{{2}}$')
    return sorted([(int(w['text']),w['yc']) for w in words if rx.fullmatch(w['text'])], key=lambda z:z[1])

def _row_bounds(group_y, horizontal, page_height, x0, x1):
    # Prefer real full-width table borders. If a PDF export drops some borders,
    # fall back to midpoints between group labels so the row remains recoverable.
    span=x1-x0
    ys=[]
    for y,a,b in horizontal:
        overlap=max(0,min(b,x1)-max(a,x0))
        if overlap >= span*0.65:
            ys.append(y)
    ys=_cluster_numbers(ys,3)
    above=max((y for y in ys if y < group_y-1), default=None)
    below=min((y for y in ys if y > group_y+1), default=None)
    return above,below

def _cell_text(words,x0,x1,y0,y1):
    selected=[w for w in words if w['xc']>x0+1 and w['xc']<x1-1 and w['yc']>y0+1 and w['yc']<y1-1]
    if not selected: return ''
    # Preserve visual reading order; PDF word extraction often emits lines in
    # exact top-to-bottom order but not always left-to-right within a line.
    selected.sort(key=lambda w:(round(w['yc']/2)*2,w['x0']))
    lines=[]
    for w in selected:
        if not lines or abs(w['yc']-lines[-1][0])>4:
            lines.append([w['yc'],w['x0'],w['text']])
        else:
            lines[-1][2]+=' '+w['text']
    return norm(' '.join(x[2] for x in lines))

def _horizontal_border_overlap(horizontal, y_target, x0, x1, tolerance=2.5):
    """Return the strongest horizontal-rule coverage near y_target.

    Spreadsheet exports omit the horizontal line where a cell is vertically
    merged across two group rows. Measuring coverage per x-cell lets the parser
    recover that merge without making the whole row band global.
    """
    span=max(1.0, x1-x0)
    best=0.0
    for y,a,b in horizontal:
        if abs(float(y)-float(y_target))>tolerance:
            continue
        overlap=max(0.0,min(float(b),x1)-max(float(a),x0))
        best=max(best,overlap/span)
    return best


def _find_matrix_table(pdf_page):
    try:
        tables=pdf_page.find_tables()
    except Exception:
        tables=[]
    return max(tables,key=lambda t:(t.bbox[2]-t.bbox[0])*(t.bbox[3]-t.bbox[1])) if tables else None


def _matrix_week_bands_from_date_row(table):
    try:
        rows=table.extract(); row_objs=table.rows
    except Exception:
        return {}
    candidates=[]
    for i,row in enumerate(rows):
        if not row or str(row[0] or '').strip().casefold()!='даты':
            continue
        vals=[norm(x) for x in row[1:] if norm(x)]
        date_hits=sum(bool(re.search(r'\d{1,2}\.\d{1,2}\.(?:\d{2}|\d{4})',x)) for x in vals)
        candidates.append((date_hits,len(vals),i))
    if not candidates:
        return {}
    date_i=max(candidates,key=lambda x:(x[0],x[1]))[2]
    bands={}; wk=0
    for ci,val in enumerate(rows[date_i][1:],1):
        if not norm(val):
            continue
        cell=row_objs[date_i].cells[ci] if ci<len(row_objs[date_i].cells) else None
        if not cell:
            continue
        wk+=1
        bands[wk]=(float(cell[0]),float(cell[2]))
    return bands


def parse_week_matrix_pdfplumber_cells(doc_bytes, course, url, stream):
    """Parse an intact weekly matrix from actual merged PDF cell geometry."""
    import io
    out=[]
    try:
        with pdfplumber.open(io.BytesIO(doc_bytes)) as pdf:
            for page in pdf.pages:
                table=_find_matrix_table(page)
                if not table:
                    continue
                bands=_matrix_week_bands_from_date_row(table)
                if len(bands)<6:
                    continue
                rows=table.extract(); row_objs=table.rows
                text=norm(page.extract_text() or '')
                m=re.search(r'(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})',text)
                if not m:
                    continue
                start,end=normalize_clock(m.group(1)),normalize_clock(m.group(2))
                if not start or not end:
                    continue
                for ri,row in enumerate(rows):
                    group=next((norm(v) for v in (row or [])[:2] if re.fullmatch(r'\d{3}',norm(v))),None)
                    if not group or ri>=len(row_objs):
                        continue
                    for ci,val in enumerate(row or []):
                        if ci==0 or not norm(val):
                            continue
                        cell=row_objs[ri].cells[ci] if ci<len(row_objs[ri].cells) else None
                        if not cell:
                            continue
                        x0,y0,x1,y1=map(float,cell)
                        subject,location=split_matrix_cell(norm(val))
                        if not subject or subject in {'Практика','Практика и элективы'}:
                            continue
                        center=(x0+x1)/2
                        overlaps=[]
                        for w,(a,b) in bands.items():
                            if min(x1,b)-max(x0,a)>0.75:
                                overlaps.append(w)
                        if not overlaps:
                            for w,(a,b) in bands.items():
                                if a-0.5<=center<=b+0.5:
                                    overlaps=[w]; break
                        for w in overlaps:
                            out.append({'weekday':None,'start':start,'end':end,'subject':subject,'location':location,
                                'group':group,'stream':stream or '','type':'practice','weekNumber':w,'weekStart':week_start(w),
                                'sourceUrl':url,'scheduleMode':'weekly-block','matrixBBox':[round(x0,3),round(y0,3),round(x1,3),round(y1,3)],
                                'parser':'pdfplumber-merged-cell-matrix-v6'})
    except Exception as exc:
        print(f'MERGED CELL MATRIX WARNING: {type(exc).__name__}: {exc}',file=sys.stderr)
    seen=set(); clean=[]
    for e in out:
        k=(e['group'],e['weekNumber'],e['subject'],e['location'],e['start'],e['end'])
        if k not in seen:
            seen.add(k); clean.append(e)
    return clean

def parse_week_matrix_coordinate(doc_bytes, course, url, stream):
    """Parse 4–6 course spreadsheet PDFs using PDF geometry.

    The official sheets are visually a matrix: group rows x academic-week
    columns, with cells merged across multiple weeks. A flat text/table parser
    cannot reliably know those spans. We recover the actual vector grid and map
    each merged cell to every week column it covers.
    """
    import io
    events=[]
    with fitz.open(stream=doc_bytes,filetype='pdf') as doc:
        carry_week_centers={}
        carry_xbounds=None
        fixed_time=None
        for page in doc:
            words=_words_from_pymupdf(page)
            wc=_header_week_centers(words,course)
            if len(wc)>=8: carry_week_centers=wc
            else: wc=carry_week_centers
            if not wc: continue
            page_text=norm(page.get_text('text'))
            ft=re.search(r'Время\s+занятий\s+семинарского\s+типа\s*:?\s*(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})',page_text,re.I)
            if not ft:
                # If the Cyrillic header is not extractable, accept the first
                # colon-based clock range before the first group. Date ranges in
                # these PDFs use dots (07.09.25 - 12.09.25), so they cannot be
                # mistaken for this fallback.
                gy=min((w['yc'] for w in words if re.fullmatch(rf'{int(course)}\d{{2}}',w['text'])),default=page.rect.height)
                head=' '.join(w['text'] for w in sorted(words,key=lambda x:(x['yc'],x['x0'])) if w['yc']<gy-20)
                ft=re.search(r'(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})',head)
            if ft:
                fixed_time=(normalize_clock(ft.group(1)),normalize_clock(ft.group(2)))
            if not fixed_time or not all(fixed_time):
                continue
            vertical,horizontal=_drawing_segments(page)
            groups=_group_centers(words,course)
            if not groups: continue
            # Week centers are useful for identifying the header, but they are
            # NOT reliable cell boundaries in the 2026/27 export. The spreadsheet
            # contains extra internal vertical lines and, in places, a week number
            # sits exactly on one of those lines. Build canonical week bands from
            # midpoints between the numbered headers and intersect each visual cell
            # with those bands. This is the important distinction between the old
            # parser and the hardened 4-course parser.
            centers=[wc[k] for k in sorted(wc)]
            if len(centers)<8: continue
            vxs=_cluster_numbers([x for x,_,_ in vertical],3)
            # The PDF has a narrow group-number column on the left and a narrow
            # trailing label column on the right. The practice matrix itself
            # starts immediately before week 1 and ends immediately after week 16.
            # Anchor those edges to the numbered week centers instead of taking
            # the absolute page-wide min/max vector line.
            if vxs:
                left_candidates=[x for x in vxs if x<=centers[0]+1]
                right_candidates=[x for x in vxs if x>=centers[-1]-1]
                table_left=max(left_candidates) if left_candidates else min(centers)-25
                table_right=min(right_candidates) if right_candidates else max(centers)+25
            else:
                table_left=min(centers)-25
                table_right=max(centers)+25
            if carry_xbounds is None: carry_xbounds=(table_left,table_right)
            else:
                table_left,table_right=carry_xbounds

            # Canonical week bands: outer edges plus midpoints between header
            # numbers. A merged practice cell may cover several bands.
            week_ids=sorted(wc)
            week_edges=[table_left]
            for i in range(len(week_ids)-1):
                a_center=wc[week_ids[i]]; b_center=wc[week_ids[i+1]]
                week_edges.append((a_center+b_center)/2)
            week_edges.append(table_right)
            week_bands={wk:(week_edges[i],week_edges[i+1]) for i,wk in enumerate(week_ids)}

            for idx,(group,gy) in enumerate(groups):
                # Group labels are the authoritative row anchors. Some exports
                # omit the horizontal rule between two groups, so midpoint bands
                # are safer than requiring a full-width horizontal line.
                if idx:
                    top=(groups[idx-1][1]+gy)/2
                elif len(groups)>1:
                    top=gy-(groups[1][1]-gy)/2
                else:
                    top=max(0,gy-24)
                if idx+1<len(groups):
                    bottom=(gy+groups[idx+1][1])/2
                elif idx:
                    bottom=gy+(gy-groups[idx-1][1])/2
                else:
                    bottom=min(page.rect.height,gy+24)
                if bottom<=top+3: continue

                active=[]
                for x,y0,y1 in vertical:
                    overlap=max(0,min(y1,bottom)-max(y0,top))
                    if overlap >= (bottom-top)*0.55:
                        active.append(x)
                active=_cluster_numbers(active,3)
                active=[x for x in active if table_left-5<=x<=table_right+5]
                if len(active)<3:
                    active=week_edges
                active=_cluster_numbers([table_left,*active,table_right],3)

                for a,b in zip(active,active[1:]):
                    if b-a<6: continue

                    # A horizontal rule can disappear exactly where Excel merged
                    # a cell vertically across two adjacent groups. Expand only
                    # this x-cell in that case; ordinary neighbouring cells keep
                    # their own group row.
                    cell_top=top; cell_bottom=bottom
                    if idx and _horizontal_border_overlap(horizontal,top,a,b)<0.70:
                        prev_gy=groups[idx-1][1]
                        cell_top=prev_gy-(gy-prev_gy)/2
                    if idx+1<len(groups) and _horizontal_border_overlap(horizontal,bottom,a,b)<0.70:
                        next_gy=groups[idx+1][1]
                        cell_bottom=next_gy+(next_gy-gy)/2
                    text=_cell_text(words,a,b,cell_top,cell_bottom)
                    if not text: continue

                    # Map the visual cell to every canonical academic week band
                    # that it actually overlaps. Do not require the week number
                    # center to lie strictly inside the cell; the official PDF
                    # uses two internal subcolumns in many weeks, so two different
                    # practice subjects can legitimately occupy one week.
                    covered=[]
                    for wk,(wx0,wx1) in week_bands.items():
                        overlap=max(0,min(b,wx1)-max(a,wx0))
                        band_width=max(1.0,wx1-wx0)
                        if overlap >= min(6.0,band_width*0.18):
                            covered.append(wk)
                    if not covered: continue

                    subject,location=split_matrix_cell(text)
                    if not subject or subject in {'Практика','Практика и элективы'}: continue

                    for wk in covered:
                        wx0,wx1=week_bands[wk]
                        slot_bounds=[wx0,wx1]
                        inner=[x for x,yy0,yy1 in vertical
                               if wx0+1<x<wx1-1 and yy0<=166.6 and yy1>=170.0]
                        inner=_cluster_numbers(inner,2.5)
                        if inner:
                            slot_bounds=[wx0,*inner,wx1]
                        slots=[]
                        for si,(sx0,sx1) in enumerate(zip(slot_bounds,slot_bounds[1:])):
                            ov=max(0,min(b,sx1)-max(a,sx0))
                            if ov>=min(4.0,(sx1-sx0)*0.18): slots.append(si)
                        if not slots: slots=[0]
                        events.append({'weekday':None,'start':fixed_time[0],'end':fixed_time[1],
                            'subject':subject,'location':location,'group':str(group),'stream':stream or '',
                            'type':'practice','weekNumber':wk,'weekStart':week_start(wk),
                            'sourceUrl':url,'scheduleMode':'weekly-block','matrixSlots':slots,
                            'parser':'pymupdf-vector-matrix-v4'})
        # Deduplicate semantic cells; the same merged cell can be seen through
        # adjacent vector fragments in some PDF exports.
    seen=set(); out=[]
    for e in events:
        k=(e['group'],e['weekNumber'],e['subject'],e['location'],e['start'],e['end'])
        if k not in seen:
            seen.add(k); out.append(e)
    return out

def parse_week_matrix_tables(doc_bytes, course, url, stream):
    """Compatibility parser for simple table exports; geometry parser is primary."""
    events=[]
    try:
        with pdfplumber.open(__import__('io').BytesIO(doc_bytes)) as pdf:
            for page in pdf.pages:
                try: tables=page.extract_tables(PRACTICE_TABLE_SETTINGS)
                except Exception: tables=[]
                for table in tables:
                    if not table or len(table)<3: continue
                    header_i=None; week_cols={}
                    for ri,row in enumerate(table[:10]):
                        vals=[norm(x) for x in (row or [])]
                        nums=[(ci,int(v)) for ci,v in enumerate(vals) if re.fullmatch(r'(?:[1-9]|[1-4]\d|5[0-2])',v)]
                        if len(nums)>=8:
                            header_i=ri; week_cols={ci:w for ci,w in nums}; break
                    if header_i is None: continue
                    page_text=norm(page.extract_text() or '')
                    fixed=re.search(r'Время\s+занятий\s+семинарского\s+типа\s*:?\s*(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})',page_text,re.I)
                    tm=(normalize_clock(fixed.group(1)),normalize_clock(fixed.group(2))) if fixed else None
                    if not tm or not all(tm): continue
                    for row in table[header_i+1:]:
                        vals=[norm(x) for x in (row or [])]
                        group=next((v for v in vals[:2] if re.fullmatch(r'\d{3}',v)),None)
                        if not group: continue
                        last_cell=None
                        for ci,wk in sorted(week_cols.items(),key=lambda x:x[1]):
                            cell=norm(vals[ci]) if ci<len(vals) else ''
                            if cell: last_cell=cell
                            if not last_cell: continue
                            subject,location=split_matrix_cell(last_cell)
                            if subject:
                                events.append({'weekday':None,'start':tm[0],'end':tm[1],'subject':subject,'location':location,
                                    'group':group,'stream':stream or '','type':'practice','weekNumber':wk,'weekStart':week_start(wk),
                                    'sourceUrl':url,'scheduleMode':'weekly-block','parser':'pdfplumber-week-matrix-v2'})
    except Exception as exc:
        print(f'TABLE MATRIX WARNING {url}: {type(exc).__name__}: {exc}',file=sys.stderr)
    seen=set(); out=[]
    for e in events:
        k=(e['group'],e['weekNumber'],e['subject'],e['location'],e['start'],e['end'])
        if k not in seen: seen.add(k); out.append(e)
    return out

def parse_practice_with_pdfplumber(doc_bytes, course, url, stream):
    """Open bytes with pdfplumber and run the grid parser."""
    events = []
    with pdfplumber.open(__import__('io').BytesIO(doc_bytes)) as pdf:
        events = parse_practice_tables(pdf.pages, course, url, stream)
    return events


def parse_practice(doc_bytes, course, url, stream):
    """Universal layout-adaptive practice parser.

    The parser first fingerprints the document and then chooses the appropriate
    extractor.  There is deliberately no ``course >= 4``/``course == N`` layout
    branch here: 4B and 5B happen to be matrix PDFs because their observed
    geometry says so, while a future document with the same geometry will use
    the same engine automatically.
    """
    from universal_schedule_parser import UniversalScheduleParser
    from types import SimpleNamespace
    engine = UniversalScheduleParser(SimpleNamespace(**globals()))
    events, profile = engine.parse_practice(doc_bytes, course, url, stream)
    # Keep exact semantic deduplication here because multiple fallback engines
    # may have seen the same merged cell.
    seen=set(); out=[]
    for e in events:
        subject,leading_location=split_leading_location(e.get('subject',''))
        if leading_location:
            e['subject']=subject
            e['location']=clean_location('; '.join(x for x in (leading_location,e.get('location','')) if x))
        k=(e.get('group'),e.get('weekNumber'),e.get('weekday'),e.get('start'),e.get('end'),e.get('subject'),e.get('location'))
        if k in seen: continue
        seen.add(k); out.append(e)
    return out


# Current 2026/27 public schedule URLs. They are a fallback only: the workflow
# first discovers PDFs from the official page, then uses this manifest if the
# page markup changes. Keeping a fallback prevents a harmless HTML redesign
# from making the first synchronization empty.
FALLBACK_SOURCES=[
('1','A','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_a_osen_1-nedelya.pdf'),
('1','A','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_a_osen-2.pdf'),
('1','B','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_b_osen_1-nedelya.pdf'),
('1','B','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_1k_b_osen-2.pdf'),
('1','A','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_ld_a-26-27-na-sajt.pdf'),
('1','B','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/1k_ld_b-26-27-na-sajt.pdf'),
('2','A','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_a_osen-3.pdf'),
('2','B','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_2k_b_osen-2.pdf'),
('2','A','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_ld_a-26-27-na-sajt.pdf'),
('2','B','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_ld_b-26-27-na-sajt.pdf'),
('3','A','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_3k_a_osen_1-nedelya-1.pdf'),
('3','A','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_3k_a_osen-1.pdf'),
('3','B','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_3k_b_osen_1-nedelya-1.pdf'),
('3','B','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_3k_b_osen-1.pdf'),
('3','A','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/3k_ld_a-26-27-na-sajt.pdf'),
('3','B','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/3k_ld_b-26-27-na-sajt.pdf'),
('4','A','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_4k_a_osen_1-nedelya.pdf'),
('4','A','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_4k_a_osen-1.pdf'),
('4','B','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_4k_b_osen_1-nedelya.pdf'),
('4','B','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_4k_b_osen-1.pdf'),
('4','A','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/10/4k_ld_a-26-27-na-sajt.pdf'),
('4','B','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/4k_ld_b-26-27-na-sajt.pdf'),
('5','A','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_5k_a_osen_1-nedelya.pdf'),
('5','A','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_5k_a_osen-1-1.pdf'),
('5','B','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/08/raspisanielekczij_5k_b_osen_1-nedelya.pdf'),
('5','B','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_5k_b_osen-1.pdf'),
('5','A','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_a-26-27-na-sajt.pdf'),
('5','B','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_b-26-27-na-sajt.pdf'),
('6','','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_6k_osen_1-nedelya.pdf'),
('6','','lecture','https://education.almazovcentre.ru/wp-content/uploads/2026/09/raspisanielekczij_6k_osen.pdf'),
('6','','practice','https://education.almazovcentre.ru/wp-content/uploads/2026/09/6k_ld-26-27-na-sajt-1.pdf'),
]

def session():
    s=requests.Session()
    retry=requests.adapters.Retry(total=4,connect=4,read=4,backoff_factor=1.2,status_forcelist=(429,500,502,503,504),allowed_methods=frozenset(['GET']))
    s.mount('https://',requests.adapters.HTTPAdapter(max_retries=retry,pool_connections=20,pool_maxsize=20))
    s.headers.update({'User-Agent':'Almazov-Student-Schedule-Sync/4.9.0-rc.1','Accept':'text/html,application/pdf,*/*'})
    return s

def classify_pdf(text, url, hinted_course=None, hinted_stream=None, hinted_kind=None):
    """Classify an official schedule PDF conservatively.

    Printed document headings override stale filenames. URL metadata is a fallback.
    Reject known non-schedule documents unless the source URL and metadata
    independently identify a specific schedule PDF.
    """
    t=norm(text)
    low=t.lower()
    ulow=url.lower()

    course_match=re.search(r'(?<!\d)([1-6])k(?:[_-]|\.)', ulow, re.I)
    course=int(course_match.group(1)) if course_match else None

    stream_match=re.search(r'[_-]([ab])(?:[_-]|\.|$)', ulow, re.I)
    stream_url=('A' if stream_match and stream_match.group(1).lower()=='a' else
                'B' if stream_match else None)

    if re.search(r'_ld(?:_|-|\.)', ulow):
        kind_url='practice'
    elif ('raspisanielekczij' in ulow or 'lekcz' in ulow or 'лекц' in ulow):
        kind_url='lecture'
    else:
        kind_url=None

    explicit_non_schedule = (
        re.search(r'(?<![а-яёa-z])педиатрия(?![а-яёa-z])', low, re.I) or
        re.search(r'клиническая\s+психология', low, re.I) or
        re.search(r'(?<![а-яёa-z])куг(?![а-яёa-z])', low, re.I) or
        re.search(r'индивидуальн(?:ый|ая|ое|ые)?\s+(?:учебн|план)', low, re.I)
    )
    if explicit_non_schedule and not (course and stream_url and kind_url):
        return None

    if not course:
        m=re.search(r'(?<!\d)([1-6])\s*курс', t, re.I)
        course=int(m.group(1)) if m else hinted_course

    # The document heading is the primary source of truth. URL names are a
    # fallback only: official links occasionally keep an old filename while the
    # PDF itself is updated. If the two disagree, emit an anomaly and follow the
    # visible heading rather than silently assigning all events to Stream B.
    heading=t[:5000]
    sm=re.search(r'поток\s*([АAБB])(?=\W|$)', heading, re.I)
    stream_text=('A' if sm and sm.group(1).upper() in ('А','A') else
                 'B' if sm and sm.group(1).upper() in ('Б','B') else None)
    if stream_text and stream_url and stream_text != stream_url:
        print(f"PARSER_ANOMALY stream_header_filename_mismatch header={stream_text} filename={stream_url} url={url}",file=sys.stderr)
    stream=stream_text or stream_url or hinted_stream

    kind=kind_url
    if not kind:
        if re.search(r'лечебное дело|занятий семинарского типа', t, re.I):
            kind='practice'
        elif re.search(r'лекц', t, re.I):
            kind='lecture'
        else:
            kind=hinted_kind

    if course and kind and (stream or int(course)==6):
        return str(course),stream,kind
    return None


KUG_FALLBACK_SOURCES={
    '1':'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_1-kurs.pdf',
    '2':'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_2-kurs.pdf',
    '3':'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_3-kurs.pdf',
    '4':'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_4-kurs.pdf',
    '5':'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_5-kurs.pdf',
    '6':'https://education.almazovcentre.ru/wp-content/uploads/2026/09/kug_lechebnoe-delo_6-kurs.pdf',
}
KUG_PERIOD_RE=re.compile(r'(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})\s+(Промежуточная\s+аттестация|Государственная\s+итоговая\s+аттестация)',re.I)
SEMESTER_RE=re.compile(r'(\d{1,2})\s+семестр',re.I)

def parse_kug_periods(doc_bytes, course, url):
    """Extract date ranges explicitly labelled as attestation from the official KUG PDF.

    KUG is the calendar educational schedule: it gives attestation periods, not
    individual exam subjects/times. Exact exam appointments, when published,
    remain a separate source layer.
    """
    doc=fitz.open(stream=doc_bytes,filetype='pdf')
    text='\n'.join(page.get_text('text') for page in doc)
    text=norm(text)
    periods=[]
    # Preserve the semester nearest to each attestation statement.
    for m in KUG_PERIOD_RE.finditer(text):
        before=text[max(0,m.start()-220):m.start()]
        semesters=list(SEMESTER_RE.finditer(before))
        semester=int(semesters[-1].group(1)) if semesters else None
        kind='assessment' if 'Промежуточ' in m.group(3) else 'gia'
        d1=datetime.datetime.strptime(m.group(1),'%d.%m.%Y').date()
        d2=datetime.datetime.strptime(m.group(2),'%d.%m.%Y').date()
        periods.append({
            'course':str(course),'kind':kind,'label':'Промежуточная аттестация' if kind=='assessment' else 'Государственная итоговая аттестация',
            'start':d1.isoformat(),'end':d2.isoformat(),'semester':semester,'sourceUrl':url,
        })
    # Deduplicate in case the PDF text extraction repeats a table fragment.
    out=[]; seen=set()
    for x in periods:
        key=(x['course'],x['kind'],x['start'],x['end'],x.get('semester'))
        if key not in seen: seen.add(key); out.append(x)
    return out

def discover_kug_sources(sess):
    found=[]
    try:
        r=sess.get(PAGE,timeout=(15,45)); r.raise_for_status()
        soup=BeautifulSoup(r.text,'html.parser')
        for a in soup.find_all('a',href=True):
            href=urljoin(PAGE,a['href'])
            if not href.lower().split('?')[0].endswith('.pdf'): continue
            txt=norm(a.get_text(' ',strip=True)); low=(txt+' '+href).lower()
            if 'куг' not in low and 'календар' not in low: continue
            if 'лечебное дело' not in low and 'lechebnoe' not in low: continue
            m=re.search(r'([1-6])\s*курс',low)
            if not m: m=re.search(r'_([1-6])-?kurs',low)
            if m: found.append((m.group(1),href,txt))
    except Exception as e:
        print(f'KUG DISCOVERY WARNING: {type(e).__name__}: {e}',file=sys.stderr)
    # Prefer the current 2026-2027 KUG when the official page exposes an
    # archive alongside the current document. Do not let dictionary insertion
    # order silently select an older academic year.
    def kug_rank(item):
        c,url,title=item
        text=(str(url)+' '+str(title)).lower()
        current=1 if ('2026' in text or '26-27' in text or '26_27' in text) else 0
        archive=1 if ('2025' in text or '25-26' in text or '25_26' in text) else 0
        return (current, -archive)
    selected={}
    for item in sorted(found,key=kug_rank,reverse=True):
        selected.setdefault(item[0],(item[1],item[2]))
    for c,url in KUG_FALLBACK_SOURCES.items():
        selected.setdefault(c,(url,Path(url).name))
    return [(c,url,title) for c,(url,title) in sorted(selected.items(),key=lambda x:int(x[0]))]

def build_assessment_index(sess):
    periods=[]; sources=[]; failures=[]
    for course,url,title in discover_kug_sources(sess):
        try:
            data=fetch_pdf(sess,url)
            parsed=parse_kug_periods(data,int(course),url)
            preview=source_preview_text(data,'pdf')
            provenance=source_provenance(data,preview,url)
            sources.append({'course':course,'title':title or Path(url).name,'url':url,'periods':len(parsed),**provenance})
            periods.extend(parsed)
            print(f'OK KUG {course}: {len(parsed)} attestation periods from {url}')
        except Exception as e:
            failures.append(f'{course} {url}: {e}')
            print(f'KUG SOURCE FAILED: {failures[-1]}',file=sys.stderr)
    if failures:
        raise RuntimeError('KUG SYNC FAILED: '+str(len(failures))+' source(s) failed:\n'+'\n'.join(failures))
    required=set(KUG_FALLBACK_SOURCES)
    seen={str(x.get('course')) for x in sources}
    missing=sorted(required-seen,key=int)
    if missing:
        raise RuntimeError('KUG SYNC FAILED: source manifest missing course(s): '+', '.join(missing))
    return periods,sources

def discover_sources(sess):
    """Discover schedule documents by semantic hints, never by extension.

    The official page currently exposes links whose visible name says `.xlsx`
    while the actual URL serves a PDF export.  We therefore accept common
    document/table extensions *and* upload URLs, then sniff the response bytes.
    """
    found=[]
    try:
        r=sess.get(PAGE,timeout=(15,45)); r.raise_for_status()
        soup=BeautifulSoup(r.text,'html.parser')
        for a in soup.find_all('a',href=True):
            href=urljoin(PAGE,a['href'])
            txt=norm(a.get_text(' ',strip=True)); low=(txt+' '+href).lower()
            if any(x in low for x in ('педиатрия','клиническая психология','куг','календар','индивидуаль','зач.кн')): continue
            if not re.search(r'(?:[1-6]k|[1-6]\s*курс)',low,re.I): continue
            # Schedule documents may be PDF, XLSX, XLS, ODS, DOCX, HTML, CSV,
            # or have no meaningful extension at all. The payload is sniffed later.
            if not any(x in low for x in ('распис','лекц','семинар','занят','_ld','lechebnoe','/uploads/')):
                continue
            found.append((None,None,None,href,txt))
    except Exception as e:
        print(f'DISCOVERY WARNING: {type(e).__name__}: {e}',file=sys.stderr)
    return found

def fetch_source(sess,url):
    r=sess.get(url,timeout=(20,90)); r.raise_for_status()
    data=r.content
    if len(data)>35*1024*1024:
        raise RuntimeError(f'source too large: {len(data)} bytes')
    fmt=sniff_format(data,r.headers.get('content-type',''),url)
    if fmt in {'binary',''}:
        raise RuntimeError(f'unknown document format (content-type={r.headers.get("content-type")}, bytes={len(data)})')
    return data,fmt,r.headers.get('content-type','')

def fetch_pdf(sess,url):
    data,fmt,ct=fetch_source(sess,url)
    if fmt!='pdf':
        raise RuntimeError(f'not a PDF (detected={fmt}, content-type={ct}, bytes={len(data)})')
    return data

def source_preview_text(data,fmt):
    if fmt=='pdf':
        doc=fitz.open(stream=data,filetype='pdf')
        return norm('\n'.join(doc[i].get_text('text') for i in range(min(3,len(doc)))))
    if fmt in {'xlsx','xls','ods','csv','tsv','html'}:
        rows=decode_rows(data,fmt)
        return norm('\n'.join(' '.join(str(x or '') for x in row) for row in rows[:80]))
    if fmt=='docx':
        from docx import Document
        doc=Document(__import__('io').BytesIO(data))
        rows=[' '.join(c.text for c in r.cells) for t in doc.tables for r in t.rows]
        rows += [p.text for p in doc.paragraphs]
        return norm('\n'.join(rows[:100]))
    if fmt=='pptx':
        from pptx import Presentation
        prs=Presentation(__import__('io').BytesIO(data)); vals=[]
        for slide in prs.slides:
            for shape in slide.shapes:
                if hasattr(shape,'text') and shape.text: vals.append(shape.text)
        return norm('\n'.join(vals[:100]))
    if fmt in {'txt','rtf'}:
        from universal_schedule_ingest import decode_text
        return norm(decode_text(data,fmt)[:30000])
    if fmt == 'image':
        # Image links are first-class official sources too. OCR is used for
        # identity verification before a parser is allowed to publish events.
        try:
            import io
            import pytesseract
            from PIL import Image, ImageOps, ImageEnhance
            with Image.open(io.BytesIO(data)) as original:
                image = ImageOps.exif_transpose(original).convert('RGB')
                image = ImageEnhance.Contrast(image).enhance(1.35)
                return norm(pytesseract.image_to_string(image, lang='rus+eng', config='--psm 6')[:30000])
        except Exception as exc:
            raise RuntimeError(f'image OCR preview unavailable: {exc}') from exc
    return ''

def classify_source(data,fmt,url,title,hinted_course=None,hinted_stream=None,hinted_kind=None):
    text=source_preview_text(data,fmt)
    meta=classify_pdf(text,url,hinted_course,hinted_stream,hinted_kind)
    if meta:return meta
    # A future table export may omit the exact phrase used by the PDF parser;
    # recover semantic metadata from the link/title and the document body.
    low=(text+' '+url+' '+title).lower()
    m=re.search(r'(?<!\d)([1-6])\s*(?:курс|k)(?!\d)',low)
    course=m.group(1) if m else hinted_course
    if not course:
        m=re.search(r'(?<!\d)([1-6])k(?:[_-]|\.)',url,re.I)
        course=m.group(1) if m else None
    sm=re.search(r'поток\s*([аaбb])',low,re.I) or re.search(r'[_-]([ab])(?:[_\-.]|$)',url,re.I)
    stream=('A' if sm and sm.group(1).upper() in ('A','А') else 'B' if sm else (hinted_stream or ''))
    kind=hinted_kind
    if not kind:
        kind='practice' if re.search(r'семинар|практи|занятий\s+семинар',low,re.I) or '_ld' in url.lower() else 'lecture' if re.search(r'лекц',low,re.I) else None
    if course and kind and (stream or int(course)==6): return str(course),stream,kind
    return None

def source_manifest(sess):
    discovered=discover_sources(sess)
    candidates=[]
    for _,_,_,url,title in discovered:
        try:
            data,fmt,_=fetch_source(sess,url)
            meta=classify_source(data,fmt,url,title)
            if meta: candidates.append((*meta,url,norm(title),data,fmt))
        except Exception as e:
            print(f'DISCOVERY SOURCE WARNING {url}: {e}',file=sys.stderr)
    def role(url,kind):
        if kind=='practice': return 'practice'
        return 'lecture-first-week' if '1-nedelya' in url.lower() else 'lecture-semester'
    have_roles={(c,st,role(url,k)) for c,st,k,url,*_ in candidates}
    for c,st,k,url in FALLBACK_SOURCES:
        r=role(url,k)
        if (c,st,r) in have_roles: continue
        candidates.append((c,st,k,url,Path(url.split('?')[0]).name,None,None))
        have_roles.add((c,st,r))
    out=[]; seen=set()
    for item in candidates:
        url=item[3]
        if url in seen: continue
        seen.add(url); out.append(item)
    required_roles={(str(c),str(st),role(url,k)) for c,st,k,url in FALLBACK_SOURCES}
    present_roles={(str(c),str(st or ''),role(url,k)) for c,st,k,url,*_ in out}
    missing_roles=sorted(required_roles-present_roles)
    if missing_roles:
        raise RuntimeError('SOURCE MANIFEST INCOMPLETE: '+', '.join(f'{c}/{st or "NONE"}/{r}' for c,st,r in missing_roles))
    return out

def parse_source(item,sess):
    # Manifest rows are now `(course, stream, kind, url, title, bytes, fmt)`.
    c,stream,kind,url,title,data,fmt=item
    stream=stream or ''
    if data is None:
        data,fmt,_=fetch_source(sess,url)
    else:
        fmt=fmt or sniff_format(data,'',url)
    actual=classify_source(data,fmt,url,title,int(c),stream or None,kind)
    if not actual or actual[0]!=str(c) or (stream and actual[1]!=stream):
        raise RuntimeError(f'classification mismatch: expected {c}/{stream}/{kind}, got {actual}; detected format={fmt}')
    events=parse_source_bytes(data,fmt,int(c),stream,kind,url,sys.modules[__name__])
    # Text-list importers return a legacy week structure; flatten it.
    if isinstance(events,list) and events and isinstance(events[0],dict) and 'subject' not in events[0] and 'events' in events[0]:
        flat=[]
        for w in events:
            for e in w.get('events',[]):
                x=dict(e);x.setdefault('weekStart',w.get('start'));flat.append(x)
        events=flat
    for e in events:
        e['stream']=e.get('stream') or ''
        e.setdefault('parser',f'universal-ingest-{fmt}-v1')
        e['sourceFormat']=fmt
    preview = source_preview_text(data, fmt)
    provenance = source_provenance(data, preview, url)
    if any(e.get('scheduleMode') == 'weekly-block' for e in events):
        provenance['dateResolution'] = 'week-number-only; no weekday/date inferred'
        if provenance.get('dateLabelAudit', {}).get('conflictingDateYears'):
            provenance['dateResolution'] = 'official-week-calendar-required; embedded table dates conflict with academic-year heading'
    return c,stream,kind,url,title,events,provenance

def validate_course(course_id,c):
    """Strict completeness validation for one course after parsing."""
    cid=str(course_id); streams=c.get('streams') if isinstance(c.get('streams'),dict) else {}
    sources=c.get('sources') if isinstance(c.get('sources'),list) else []
    events=c.get('events') if isinstance(c.get('events'),list) else []
    errs=[]
    expected_streams=('A','B') if cid in {'1','2','3','4','5'} else ('',)
    for st in expected_streams:
        label=st or 'None'
        groups=streams.get(st) if isinstance(streams.get(st),list) else []
        expected_groups=list(ROSTER_CONTRACT.get(cid,{}).get(st,[]))
        actual_groups=sorted({str(x) for x in groups},key=int)
        if not groups: errs.append(f'{cid}/{label}: missing groups' + (f' for stream {label}' if label in {'A','B'} else ''))
        missing_groups=sorted(set(expected_groups)-set(actual_groups),key=int)
        extra_groups=sorted(set(actual_groups)-set(expected_groups),key=int)
        if missing_groups: errs.append(f'{cid}/{label}: practice roster missing groups: {missing_groups}')
        if extra_groups: errs.append(f'{cid}/{label}: unexpected practice groups: {extra_groups}')
        practice_groups={str(e.get('group')) for e in events if e.get('stream','')==st and e.get('type')=='practice'}
        missing_event_groups=sorted(set(expected_groups)-practice_groups,key=int)
        if missing_event_groups: errs.append(f'{cid}/{label}: no practice events for groups: {missing_event_groups}')
        if not any(x.get('stream','')==st and x.get('kind')=='lecture' for x in sources): errs.append(f'{cid}/{label}: missing lecture source')
        if not any(x.get('stream','')==st and x.get('kind')=='practice' for x in sources): errs.append(f'{cid}/{label}: missing practice source')
        if not any(e.get('stream','')==st and e.get('type')=='lecture' for e in events): errs.append(f'{cid}/{label}: no lecture events')
        if not any(e.get('stream','')==st and e.get('type')=='practice' for e in events): errs.append(f'{cid}/{label}: no practice events')
        lc=sum(1 for e in events if e.get('stream','')==st and e.get('type')=='lecture')
        pc=sum(1 for e in events if e.get('stream','')==st and e.get('type')=='practice')
        if lc<3: errs.append(f'{cid}/{label}: suspiciously few lecture events: {lc}')
        if pc<3: errs.append(f'{cid}/{label}: suspiciously few practice events: {pc}')
    return errs

def apply_verified_schedule_overrides(courses):
    """Apply explicitly verified student-schedule overlays after official parsing.

    Some university source PDFs expose only one two-academic-hour block while the
    student's combined schedule contains the two consecutive blocks separately.
    Overrides are intentionally narrow, source-marked, and never inferred.
    """
    path=Path('data/verified-schedule-overrides.json')
    if not path.exists():
        return 0
    payload=json.loads(path.read_text(encoding='utf-8'))
    applied=0
    for o in payload.get('overrides',[]):
        course=str(o.get('course',''))
        group=str(o.get('group',''))
        if course not in courses or not re.fullmatch(r'\d{3}',group):
            continue
        c=courses[course]
        # Remove a conflicting event for the same exact group/week/day/time,
        # then insert the verified record. This prevents room/subject conflicts.
        key=(group,int(o.get('weekNumber',0)),int(o.get('weekday',9) if o.get('weekday') is not None else 9),o.get('start'),o.get('end'))
        kept=[]
        for e in c['events']:
            ek=(str(e.get('group','')),int(e.get('weekNumber',0)),int(e.get('weekday',9) if e.get('weekday') is not None else 9),e.get('start'),e.get('end'))
            if ek==key:
                continue
            kept.append(e)
        record={k:v for k,v in o.items() if k not in {'course'}}
        normalize_event_time(record)
        record.update({'group':group,'stream':o.get('stream',''),'type':'practice','parser':'verified-double-overlay-v2','verifiedSource':'Пользовательская проверка Расписание.pdf'})
        c['events']=kept+[record]
        applied+=1
    return applied

def main():
    sess=session(); manifest=source_manifest(sess)
    if not manifest: raise RuntimeError('SYNC FAILED: no official PDF sources discovered or available')
    assessment_periods,kug_sources=build_assessment_index(sess)
    assessment_courses={str(x.get('course')) for x in assessment_periods}
    missing_assessment=[c for c in map(str,range(1,7)) if c not in assessment_courses]
    if missing_assessment:
        raise RuntimeError('KUG validation failed: no attestation period parsed for course(s): '+', '.join(missing_assessment))
    courses={str(c):{'specialty':'31.05.01','groups':[],'streams':({'A':[],'B':[]} if c<6 else {'':[]}), 'sources':[],'events':[],'streamLabels':{'A':'Поток А','B':'Поток Б'} if c<6 else {}} for c in range(1,7)}
    failures=[]
    for item in manifest:
        try:
            c,st,k,url,title,events,provenance=parse_source(item,sess)
            # Apply authoritative week date ranges only to weekly matrix rows. A matrix
            # column/index is not a weekday, so no date is ever generated from it.
            week_path=Path('data/academic-weeks-2026-2027.json')
            week_map={}
            if week_path.exists():
                try:
                    week_doc=json.loads(week_path.read_text(encoding='utf-8'))
                    if week_doc.get('status') in ('live-verified','web-text-reviewed-byte-unverified') and week_doc.get('academicYear')=='2026/2027':
                        week_map={int(w['weekNumber']):w for w in week_doc.get('weeks',[]) if isinstance(w,dict)}
                except (OSError,ValueError,TypeError):
                    week_map={}
            for event in events:
                if event.get('scheduleMode')!='weekly-block': continue
                matrix_week=int(event.get('weekNumber') or 0)
                calendar_week=matrix_week
                week=week_map.get(calendar_week)
                if week and matrix_week > 0:
                    event['matrixWeekNumber']=matrix_week
                    event['calendarWeekNumber']=calendar_week
                    event['weekCalendarOffset']=0
                    event['weekRangeStart']=week['from']; event['weekRangeEnd']=week['to']
                    event['weekCalendarSource']=week_doc.get('source',{}).get('url')
                    event['weekCalendarSha256']=week_doc.get('source',{}).get('sha256')
                    event['weekCalendarStatus']=week_doc.get('status')
                    event['date']=None; event['dateHint']=None; event['weekDate']=None
            cc=courses[str(c)]
            source_row={'kind':k,'stream':st or '','title':title,'url':url,'events':len(events),**provenance}
            if provenance.get('academicYearInDocument') != '2026/2027':
                source_row['identityWarning']='Document does not explicitly match academic year 2026/2027'
            if provenance.get('dateLabelAudit',{}).get('conflictingDateYears') and not provenance.get('dateResolution','').startswith('official-week-calendar-required'):
                source_row['identityWarning']='Embedded dates conflict with expected academic year; manual review required'
            if any(e.get('scheduleMode')=='weekly-block' for e in events):
                if all(e.get('weekRangeStart') and e.get('weekRangeEnd') and e.get('calendarWeekNumber') == int(e.get('weekNumber') or 0) for e in events if e.get('scheduleMode')=='weekly-block'):
                    source_row['dateResolution']='official-week-calendar-2026-2027'
                    source_row['matrixWeekOffset']=0
                    source_row['matrixWeekAlignment']='matrixWeekNumber = official calendarWeekNumber'
                else:
                    source_row['dateResolution']='week-number-only; not calendar-dated'
            cc['sources'].append(source_row)
            if k=='practice':
                groups=sorted({str(e['group']) for e in events if re.fullmatch(r'\d{3}',str(e.get('group','')))},key=int)
                if groups:
                    stream_key = st or ''
                    cc['streams'][stream_key]=sorted(set(cc['streams'].get(stream_key,[])+groups),key=int)
            cc['events'].extend(events)
            print(f'OK {c}/{st}/{k}: {len(events)} events from {url}')
        except Exception as e:
            failures.append(f'{item[0]}/{item[1]}/{item[2]} {item[3]}: {e}')
            print('SOURCE FAILED: '+failures[-1],file=sys.stderr)
    if failures: raise RuntimeError('SYNC FAILED: '+str(len(failures))+' source(s) failed:\n'+'\n'.join(failures))
    # Normalize long blocks into the two standard consecutive Almazov pairs
    # before any validation/publication.  The previous implementation had the
    # splitter defined but never invoked for the official live pipeline, so
    # matrix/PDF imports could still publish a single 3h+ event.
    split_total=0
    org_total=0
    for cc in courses.values():
        before=len(cc['events'])
        expanded=expand_double_lesson_events(cc['events'])
        merged=merge_consecutive_identical_events(expanded)
        cc['events']=merged
        split_total += max(0,len(expanded)-before)
        org_total += sum(1 for e in merged if e.get('orgMerged'))
    if org_total:
        print(f'ORG CONTINUOUS EVENTS: {org_total}')
    if split_total:
        print(f'EXPANDED DOUBLE LESSON BLOCKS: {split_total} additional events')
    applied_overrides=apply_verified_schedule_overrides(courses)
    if applied_overrides:
        print(f'APPLIED VERIFIED SCHEDULE OVERRIDES: {applied_overrides}')
    course_warnings=[]
    known_subjects=[str(e.get('subject','')) for course_data in courses.values() for e in course_data.get('events',[]) if str(e.get('subject','')).strip()]
    for cid,c in courses.items():
        # First-week and semester lecture PDFs can overlap on week 1. Remove
        # exact semantic duplicates without collapsing two different subjects
        # that happen to share the same time.
        seen=set(); unique=[]
        for e in c['events']:
            key=(e.get('type'),e.get('stream'),e.get('group'),e.get('weekNumber'),e.get('date'),e.get('weekday'),e.get('start'),e.get('end'),e.get('subject'),e.get('location'))
            if key in seen: continue
            seen.add(key); unique.append(e)
        c['events']=unique
        c['groups']=sorted({g for gs in c['streams'].values() for g in gs},key=int)
        for e in c['events']:
            e['location']=repair_subject_leaks_from_location(e.get('location',''),known_subjects)
            subject,leading_location=split_leading_location(e.get('subject',''))
            if leading_location:
                e['subject']=subject
                e['location']=clean_location('; '.join(x for x in (leading_location,e.get('location','')) if x))
        c['events'].sort(key=event_sort_key)
        for e in c['events']:
            if not normalize_event_time(e): raise RuntimeError(f'{cid}: invalid time {e.get("start")} - {e.get("end")}')
            if e.get('weekday') is not None and e.get('weekday') not in range(7): raise RuntimeError(f'{cid}: invalid weekday {e.get("weekday")}')
            if not e.get('subject'): raise RuntimeError(f'{cid}: empty subject')
            if e.get('type')=='practice' and not re.fullmatch(r'\d{3}',str(e.get('group'))): raise RuntimeError(f'{cid}: practice without group')
            if e.get('type')=='lecture' and e.get('group')!='ALL': raise RuntimeError(f'{cid}: lecture became group-specific')
        course_warnings.extend(validate_course(cid,c))
    if course_warnings:
        raise RuntimeError('SYNC VALIDATION FAILED:\n'+'\n'.join('  - '+w for w in course_warnings))
    generated_at=datetime.datetime.now(datetime.timezone.utc).isoformat()
    payload={'schemaVersion':7,'dataState':'live-generated','generatedAt':generated_at,'sourcePage':PAGE,'specialty':'31.05.01','courses':courses,'assessmentPeriods':assessment_periods,'kugSources':kug_sources,'bootstrapNote':'Generated from the official Almazov student schedule page. KUG periods are date ranges for attestation; exact exam appointments are a separate source layer when published.'}
    OUT.parent.mkdir(parents=True,exist_ok=True); tmp=OUT.with_suffix('.json.tmp'); tmp.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8'); tmp.replace(OUT)
    total=sum(len(c['events']) for c in courses.values())
    status={
        'status':'ok','dataState':'live-generated','engineVersion':Path('SCHEDULE_ENGINE_VERSION.txt').read_text(encoding='utf-8').splitlines()[0].split(':',1)[-1].strip(),
        'generatedAt':generated_at,'sourcePage':PAGE,'schemaVersion':7,
        'courses':{k:{'groups':len(v['groups']),'events':len(v['events']),
                       'lecture':sum(e['type']=='lecture' for e in v['events']),
                       'practice':sum(e['type']=='practice' for e in v['events'])} for k,v in courses.items()},
        'assessmentPeriods':len(assessment_periods),'kugSources':len(kug_sources)
    }
    status_path=Path('data/official-sync-status.json'); status_path.write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'schemaVersion':7,'sources':len(manifest),'kugSources':len(kug_sources),'assessmentPeriods':len(assessment_periods),'events':total,'courses':{k:{'groups':len(v['groups']),'events':len(v['events']),'lecture':sum(e['type']=='lecture' for e in v['events']),'practice':sum(e['type']=='practice' for e in v['events'])} for k,v in courses.items()}},ensure_ascii=False,indent=2))
    if course_warnings:
        print('SYNC VALIDATION WARNINGS (published anyway, these courses/streams need a closer look):',file=sys.stderr)
        for w in course_warnings: print('  - '+w,file=sys.stderr)

if __name__=='__main__': main()
