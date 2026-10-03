#!/usr/bin/env python3
"""Pre-release 2.0 / schedule engine 4.3.0-pre5 acceptance tests."""
from pathlib import Path
import json,re,subprocess,sys,shutil
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
WF=(ROOT/'.github/workflows/sync-official-schedules.yml').read_text(encoding='utf-8')
PKG=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
VER=json.loads((ROOT/'version.json').read_text(encoding='utf-8'))
DATA=json.loads((ROOT/'data/official-schedules.json').read_text(encoding='utf-8'))
checks=[]
def check(name,cond):
    checks.append((name,bool(cond)))
check('release version 4.3.0-pre5',PKG['version']=='4.3.0-pre5' and VER['version']=='4.3.0-pre5')
check('schedule sync user-agent','Almazov-Student-Schedule-Sync/4.3.0-pre5' in (ROOT/'scripts/build_official_schedule.py').read_text(encoding='utf-8'))
check('workflow 30 minute cron',"cron: '*/30 * * * *'" in WF)
check('workflow manual dispatch','workflow_dispatch:' in WF)
check('workflow concurrency','concurrency:' in WF and 'cancel-in-progress: false' in WF)
check('workflow parser test','scripts/test_schedule_parser.py' in WF)
check('workflow generated index validation',all(re.search(r'python\s+scripts/'+name+r'(?:\s|$)', WF) for name in ['validate_generated_index.py','validate_schedule_data.py','deep_schedule_audit.py']))
check('workflow race-safe push','git reset --hard origin/main' in WF and 'git push origin HEAD:main' in WF)
check('client 30 minute refresh', bool(re.search(r'setInterval\(\(\)=>autoSyncOfficialSchedule\(true\),30\*60\*1000\)', HTML)))
check('client online refresh',"window.addEventListener('online',()=>autoSyncOfficialSchedule(true))" in HTML)
check('client visibility refresh',"document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')autoSyncOfficialSchedule(false)})" in HTML)
check('cache bust schedule fetch',"cache:'no-store'" in HTML and 'Date.now()' in HTML)
check('healthy index gate before manual sync','isHealthyOfficialIndex(idx,course)' in HTML)
check('healthy index gate before auto sync','isHealthyOfficialIndex(idx,course)' in HTML)
check('personal data snapshot','personalSnapshot' in HTML and 'локальные заметки, задачи, ДЗ' in HTML)
check('homework legacy matching','function homeworkMatchesEvent' in HTML)
check('notes merge','function mergeNotes' in HTML)
check('schedule sanitizer','function sanitizeActiveSchedule()' in HTML)
check('schedule sanitizer call','sanitizeActiveSchedule()' in HTML)
check('course 6 stream is explicit empty',"const expectedStreams=id==='6'?['']:['A','B']" in HTML and "const streams=c?.streams&&typeof c.streams==='object'?c.streams:{}" in HTML)
check('bootstrap health accepts available official layer','const complete=healthy&&eventsByType.lecture>0&&eventsByType.practice>0' in HTML and 'const lectureOnly=healthy&&eventsByType.lecture>0&&eventsByType.practice===0' in HTML)
check('course 1-6 selector options','[1,2,3,4,5,6]' in HTML)
check('official course selector wired','setupPremiumSelect("officialCourse",{})' in HTML)
check('official group selector wired','setupPremiumSelect("officialGroup",{})' in HTML)
check('priority selectors wired','setupPremiumSelect("taskPriority"' in HTML and 'setupPremiumSelect("notePriority"' in HTML and 'setupPremiumSelect("hwPriority"' in HTML)
check('personal event selector wired','setupPremiumSelect("peCategory",{})' in HTML)
check('app cache clear control','async function clearAppCache()' in HTML and 'caches.delete(name)' in HTML and 'getRegistrations()' in HTML)
check('profile data survives cache clear','localStorage.clear()' not in HTML)
check('no pictographic emoji in UI','\ud83c' not in HTML and '📚' not in HTML and '💙' not in HTML and '🩺' not in HTML)
check('portal above modal','z-index:2147483647!important' in HTML)
check('touch pointerdown selection',"menu.addEventListener('pointerdown'" in HTML)
check('no direct schedule overwrite by incomplete index',"Текущее расписание сохранено" in HTML)
check('schema 7 bootstrap',DATA.get('schemaVersion')==7 and set(DATA.get('courses',{}))==set('123456'))
check('bootstrap locations contain no approval footer', all('Заведующий Отделом' not in str(e.get('location','')) and '_________________' not in str(e.get('location','')) for c in DATA.get('courses',{}).values() for e in c.get('events',[])))
check('all rosters present',all(len(DATA['courses'][c].get('groups',[]))==n for c,n in {'1':35,'2':29,'3':22,'4':24,'5':22,'6':18}.items()))
check('all KUG sources',set(x.get('course') for x in DATA.get('kugSources',[]))==set('123456'))
# The bootstrap is allowed to be stale before the first GitHub sync, but must not
# be silently used to overwrite a healthy local schedule. CI's generated-index
# validators remain strict and will stop publication until all six are complete.
check('course-scoped official health','function isHealthyOfficialIndex(json,courseId=null)' in HTML and 'const ids=courseId!=null?[String(courseId)]' in HTML)
check('course-scoped sync error','Официальные данные для ${course} курса' in HTML)
check('generated validator is strict',"if not events: errors.append(f'{cid}: events empty')" in (ROOT/'scripts/validate_generated_index.py').read_text())

failed=[n for n,c in checks if not c]
print(f'FULL PRE-RELEASE TESTS: {len(checks)-len(failed)}/{len(checks)} passed')
if failed:
    print('FAILED:')
    for n in failed: print(' -',n)
    raise SystemExit(1)
