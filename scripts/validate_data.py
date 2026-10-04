import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
manual=json.loads((ROOT/'data/manual-specialist-schedules.json').read_text(encoding='utf-8'))
errs=[];warns=[];time_re=re.compile(r'^([01]\d|2[0-3]):([0-5]\d)$')

def parse_weeks(spec):
    out=[]
    for part in str(spec or '').replace('–','-').replace('—','-').replace(' ','').split(','):
        if not part: continue
        if '-' in part:
            a,b=map(int,part.split('-',1))
            if b<a: errs.append(f'bad week range {spec}')
            out.extend(range(a,b+1))
        else: out.append(int(part))
    return sorted(set(out))

for specialty,p in manual['programs'].items():
    for course,c in p['courses'].items():
        groups=set(c.get('groups',[])); seen=set(); rules=c.get('lectureRules',[])+c.get('practiceRules',[])
        if c.get('status')=='published_practice_only' and c.get('lectureRules'):
            errs.append(f'{specialty}/{course}: source-mismatch course contains active lecture rules')
        if c.get('lectureStatus')=='source_mismatch' and c.get('lectureRules'):
            errs.append(f'{specialty}/{course}: lectureStatus=source_mismatch but lectureRules are active')
        for idx,r in enumerate(rules):
            st,en=r.get('start',''),r.get('end','')
            if not time_re.match(st) or not time_re.match(en): errs.append(f'{specialty}/{course}/{idx}: invalid time')
            elif en<=st: errs.append(f'{specialty}/{course}/{idx}: end <= start')
            wd=int(r.get('weekday',0) or 0)
            if wd<1 or wd>7: errs.append(f'{specialty}/{course}/{idx}: weekday must be 1..7')
            wk=parse_weeks(r.get('weeks','')); lo,hi=c['weeks']['start'],c['weeks']['end']
            if wk and (min(wk)<lo or max(wk)>hi): warns.append(f'{specialty}/{course}/{idx}: weeks outside declared window {r.get("weeks")}')
            rgroups=r.get('groups') or list(groups)
            for g in rgroups:
                if g not in groups: errs.append(f'{specialty}/{course}/{idx}: unknown group {g}')
            for g in rgroups:
                for w in wk:
                    key=(g,w,wd,st,en,r.get('subject',''),r.get('lessonType',''),r.get('doubleIndex',''))
                    if key in seen: errs.append(f'duplicate schedule key {key}')
                    seen.add(key)
        if c.get('lectureStatus')=='source_mismatch': warns.append(f'{specialty}/{course}: lectures quarantined because the official linked PDF identifies another specialty')

if errs:
    print('ERRORS:');print('\n'.join(errs));sys.exit(1)
print(f'OK · programs={len(manual["programs"])} · groups={sum(len(c.get("groups",[])) for p in manual["programs"].values() for c in p["courses"].values())}')
print(f'WARNINGS={len(warns)}')
for w in warns[:30]: print('WARN',w)
