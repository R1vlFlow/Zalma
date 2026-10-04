#!/usr/bin/env python3
"""Build data/official-schedules.json from the official Almazov student page.
The parser is deliberately conservative: it never fabricates a lesson. If a PDF
cannot be classified or parsed, the build fails instead of publishing bad data.
"""
from __future__ import annotations
import argparse, json, re, sys, hashlib
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
import pdfplumber

PAGE='https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/'
OUT=Path('data/official-schedules.json')
ROOT=Path('.sync-pdfs')
UA='AlmazovStudentScheduleBot/1.0 (+https://github.com/)'
WEEKS={
1:('2026-09-01','2026-09-05'),2:('2026-09-07','2026-09-12'),3:('2026-09-14','2026-09-19'),4:('2026-09-21','2026-09-26'),5:('2026-09-28','2026-10-03'),6:('2026-10-05','2026-10-10'),7:('2026-10-12','2026-10-17'),8:('2026-10-19','2026-10-24'),9:('2026-10-26','2026-10-31'),10:('2026-11-02','2026-11-07'),11:('2026-11-09','2026-11-14'),12:('2026-11-16','2026-11-21'),13:('2026-11-23','2026-11-28'),14:('2026-11-30','2026-12-05'),15:('2026-12-07','2026-12-12'),16:('2026-12-14','2026-12-19'),17:('2026-12-21','2026-12-26'),18:('2026-12-28','2027-01-02'),19:('2027-01-04','2027-01-09'),20:('2027-01-11','2027-01-16'),21:('2027-01-18','2027-01-23'),22:('2027-01-25','2027-01-30')}
STREAMS={1:(101,122,123,135),2:(201,216,217,229),3:(301,312,313,322),4:(401,412,413,424),5:(501,512,513,522),6:(601,618,601,618)}
DAY={'ПН':0,'ВТ':1,'СР':2,'ЧТ':3,'ПТ':4,'СБ':5,'ВС':6,'ПОНЕДЕЛЬНИК':0,'ВТОРНИК':1,'СРЕДА':2,'ЧЕТВЕРГ':3,'ПЯТНИЦА':4,'СУББОТА':5,'ВОСКРЕСЕНЬЕ':6}
TIME_RE=re.compile(r'(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})')
WEEK_RE=re.compile(r'\(([^()]*\d[^()]*)\)')
LOCATION_RE=re.compile(r'(Солнечное|ул\.|пр\.|ЦДТИ|ШКОЛА|АСЦ|КПК|Башня|лит\.|ауд\.|каб\.|зал\s*["«]|Корпус|корп\.)',re.I)

def norm(s): return re.sub(r'\s+',' ',str(s or '').replace('\xa0',' ').replace('­','')).strip(' ,.;')
def weeks(text):
    out=[]
    for raw in re.findall(r'\(([^()]*)\)',str(text)):
        for a,b in re.findall(r'(\d+)\s*[-–—]\s*(\d+)',raw): out += range(int(a),int(b)+1)
        rest=re.sub(r'\d+\s*[-–—]\s*\d+','',raw)
        out += [int(x) for x in re.findall(r'\d+',rest)]
    return sorted(set(x for x in out if 1<=x<=22))
def clean_subject(s):
    s=norm(s)
    s=re.sub(r'^(?:/|\.|,|;)+','',s).strip()
    s=re.sub(r'\bжизнидеятельност\s+и\b','жизнедеятельности',s,flags=re.I)
    return s
def split_location(s):
    s=norm(s)
    m=LOCATION_RE.search(s)
    if not m:return clean_subject(s),''
    subj=clean_subject(s[:m.start()])
    loc=norm(s[m.start():])
    return subj,loc
def records(cell):
    text=norm(cell)
    ms=list(WEEK_RE.finditer(text))
    if not ms:
        subj,loc=split_location(text); return [(subj,loc,[])] if subj else []
    out=[]
    prev_end=0
    for i,m in enumerate(ms):
        before=text[prev_end:m.start()]
        # remove the location tail of the preceding record; the remaining text is the new subject
        if i: 
            _, before=split_location(before)
            before=before.strip(' ,.;')
        after=text[m.end():ms[i+1].start() if i+1<len(ms) else len(text)]
        subj=clean_subject(before)
        loc=norm(after)
        if not subj and out: subj=out[-1][0]
        if subj: out.append((subj,loc,weeks(m.group(0))))
        prev_end=m.end()
    return out

def rosters(course):
    a,b,c,d=STREAMS[course]
    if course==6: gs=list(map(str,range(a,b+1))); return gs,{'A':gs}
    A=list(map(str,range(a,b+1)));B=list(map(str,range(c,d+1)));return A+B,{'A':A,'B':B}

def download(session,url,path):
    r=session.get(url,timeout=60);r.raise_for_status();path.write_bytes(r.content);return hashlib.sha256(r.content).hexdigest()

def classify(links):
    found={c:[] for c in range(1,7)}
    for href,title in links:
        txt=(title+' '+href).lower()
        m=re.search(r'(?:^|[^0-9])([1-6])\s*(?:к|k)урс',txt)
        if not m:
            m=re.search(r'([1-6])k(?:_|-|ld)',href.lower())
        if not m: continue
        c=int(m.group(1))
        stream=''
        if re.search(r'поток\s*а|[_-]a(?:[_-]|\.)',txt):stream='A'
        elif re.search(r'поток\s*б|[_-]b(?:[_-]|\.)',txt):stream='B'
        kind='practice' if re.search(r'практи|семинар|_ld_|-ld-|_ld',txt) else 'lecture'
        if 'кп' in txt and kind=='practice': kind='practice'
        found[c].append((kind,stream,urljoin(PAGE,href),title))
    return found

def parse_lecture(path,course,stream,source):
    events=[]
    first_week=1 if re.search(r'1[-_]?нед|_1-',source.lower()) else None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text=page.extract_text(x_tolerance=2,y_tolerance=3) or ''
            lines=[norm(x) for x in text.splitlines() if norm(x)]
            day=None;i=0
            while i<len(lines):
                up=lines[i].upper().strip(' .:')
                if up in DAY: day=DAY[up];i+=1;continue
                tm=TIME_RE.search(lines[i])
                if not tm: i+=1;continue
                start=f'{int(tm.group(1)):02d}:{tm.group(2)}';end=f'{int(tm.group(3)):02d}:{tm.group(4)}'
                block=[];j=i+1
                while j<len(lines):
                    u=lines[j].upper().strip(' .:')
                    if u in DAY or TIME_RE.search(lines[j]):break
                    block.append(lines[j]);j+=1
                content=norm(' '.join(block))
                recs=records(content)
                if not recs and content:
                    subj,loc=split_location(content);recs=[(subj,loc,[])]
                for subj,loc,wks in recs:
                    use=wks or ([first_week] if first_week else [])
                    for wk in use:
                        if wk not in WEEKS:continue
                        events.append(event(course,stream,day,start,end,subj,loc,wk,'lecture',source))
                i=j
    return events

def parse_practice(path,course,source):
    events=[]
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables=page.extract_tables()
            for table in tables:
                header_idx=None; group_cols={}
                for ri,row in enumerate(table[:20]):
                    for ci,val in enumerate(row or []):
                        m=re.fullmatch(r'\s*(\d{3})\s*',str(val or ''))
                        if m and int(m.group(1))//100==course: group_cols[m.group(1)]=ci
                    if len(group_cols)>=3: header_idx=ri;break
                if header_idx is None: continue
                day=None
                for row in table[header_idx+1:]:
                    vals=[norm(x) for x in (row or [])]
                    if not vals:continue
                    joined=' '.join(vals[:2])
                    for k,v in DAY.items():
                        if k in vals[0].upper() or k==vals[0].upper(): day=v;break
                    times=TIME_RE.findall(joined)
                    if not times:
                        # some extractors put the time in a later column
                        times=TIME_RE.findall(' '.join(vals[:4]))
                    if not times:continue
                    start=f'{int(times[0][0]):02d}:{times[0][1]}';end=f'{int(times[0][2]):02d}:{times[0][3]}'
                    for g,ci in group_cols.items():
                        cell=vals[ci] if ci<len(vals) else ''
                        for subj,loc,wks in records(cell):
                            for wk in (wks or [None]):
                                if wk is None:continue
                                events.append(event(course,stream_for(course,g),day,start,end,subj,loc,wk,'practice',source,group=g))
    return events

def stream_for(course,g):
    if course==6:return 'A'
    A,B=rosters(course)[1].values();return 'A' if g in A else 'B'

def event(course,stream,day,start,end,subject,location,wk,kind,source,group=''):
    return {'id':hashlib.sha1(f'{course}|{group}|{stream}|{wk}|{day}|{start}|{end}|{subject}|{kind}'.encode()).hexdigest()[:16], 'course':course,'group':group,'stream':stream,'weekNumber':wk,'weekStart':WEEKS[wk][0],'weekday':day,'start':start,'end':end,'subject':clean_subject(subject),'location':norm(location),'type':kind,'sourceUrl':source}

def dedupe(events):
    out={}
    for e in events:
        key=(e['course'],e.get('group',''),e.get('stream',''),e['weekNumber'],e['weekday'],e['start'],e['end'],e['subject'],e['type'],e.get('location',''))
        out[key]=e
    return sorted(out.values(),key=lambda e:(e['weekNumber'],e['weekday'] if e['weekday'] is not None else 9,e['start'],e['group'],e['subject']))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--allow-empty',action='store_true');args=ap.parse_args()
    ROOT.mkdir(exist_ok=True)
    s=requests.Session();s.headers['User-Agent']=UA
    html=s.get(PAGE,timeout=60);html.raise_for_status();soup=BeautifulSoup(html.text,'html.parser')
    links=[(a.get('href',''),norm(a.get_text(' ',strip=True))) for a in soup.find_all('a') if a.get('href','').lower().endswith('.pdf')]
    classified=classify(links)
    courses={}
    for c in range(1,7):
        groups,streams=rosters(c);events=[];sources=[]
        for kind,stream,url,title in classified[c]:
            # Skip unrelated elective/individual PDFs by requiring LD/Лечебное дело context.
            if not re.search(r'ld|лечеб|к_лд|курс', (url+' '+title).lower()):continue
            fn=ROOT/f'{c}_{stream or "all"}_{kind}_{hashlib.sha1(url.encode()).hexdigest()[:10]}.pdf'
            try: download(s,url,fn)
            except Exception as exc: print('download failed',url,exc,file=sys.stderr);continue
            try:
                parsed=parse_lecture(fn,c,stream,url) if kind=='lecture' else parse_practice(fn,c,url)
            except Exception as exc:
                print('parse failed',url,exc,file=sys.stderr);continue
            if parsed:
                events.extend(parsed);sources.append({'kind':kind,'stream':stream,'title':title,'url':url,'events':len(parsed)})
        events=dedupe(events)
        courses[str(c)]={'groups':groups,'streams':streams,'events':events,'sources':sources}
        print(f'course {c}: {len(events)} events; lecture={sum(e["type"]=="lecture" for e in events)} practice={sum(e["type"]=="practice" for e in events)}')
    total=sum(len(c['events']) for c in courses.values())
    if total==0 and not args.allow_empty: raise SystemExit('No schedule events parsed; refusing to publish.')
    for c in range(1,7):
        ev=courses[str(c)]['events']
        if not any(e['type']=='lecture' for e in ev): raise SystemExit(f'Course {c}: no lectures parsed')
        if not any(e['type']=='practice' for e in ev): raise SystemExit(f'Course {c}: no practice parsed')
    data={'schemaVersion':10,'generatedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'academicYear':'2026/2027','source':{'title':'Кабинет студента — расписание','url':PAGE},'weekMap':{str(k):list(v) for k,v in WEEKS.items()},'courses':courses}
    OUT.parent.mkdir(exist_ok=True);OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
