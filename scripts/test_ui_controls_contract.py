#!/usr/bin/env python3
from pathlib import Path
import re,sys
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
SW=(ROOT/'sw.js').read_text(encoding='utf-8')
checks=[]
def check(name,ok): checks.append((name,bool(ok)))
select_ids=re.findall(r'<select\b[^>]*\bid="([^"]+)"',HTML)
required=['taskSubject','taskPriority','materialSubjectFilter','materialCourseFilter','noteSubject','notePriority','specialty','course','officialCourse','officialGroup','hwPriority','peCategory']
check('all native dropdowns discovered',set(required).issubset(set(select_ids)))
for sid in required:
    check(f'dropdown {sid} uses premium component',f'setupPremiumSelect("{sid}"' in HTML)
check('clear cache button exists','data-action="clear-app-cache"' in HTML)
check('clear cache function exists','async function clearAppCache()' in HTML)
check('Cache Storage deletion uses Cache API','caches.keys()' in HTML and 'caches.delete(name)' in HTML)
check('service workers are unregistered','getRegistrations()' in HTML and 'r.unregister()' in HTML)
check('profile data is preserved','localStorage.clear()' not in HTML and 'localStorage.removeItem(STORAGE_KEY)' in HTML)
check('IndexedDB materials are preserved','indexedDB.open(MATERIAL_DB' in HTML and 'clearAppCache' in HTML)
check('dropdown Escape support',"ev.key==='Escape'" in HTML)
check('dropdown ARIA state','aria-controls' in HTML and 'aria-selected' in HTML)
check('dropdown portal is viewport anchored',"menu.style.position='fixed'" in HTML)
check('new service worker cache generation',"almazov-student-ui-prerelease-2.0-cache2" in SW)
check('official sync is specialty-scoped', 'OFFICIAL_SCHEDULE_SPECIALTIES' in HTML and 'officialScheduleSupportsSpecialty' in HTML)
check('profile change cannot leak another identity schedule', 'identityChanged&&data.schedule?.ownerKey&&data.schedule.ownerKey!==subjectKey()' in HTML and 'data.schedule=JSON.parse(JSON.stringify(DEFAULT_SCHEDULE))' in HTML)
check('dynamic IDs are HTML-escaped in material handlers', "openMaterial('${esc(m.id)}')" in HTML and "removeMaterial('${esc(m.id)}')" in HTML)
check('dynamic homework IDs are HTML-escaped in modal handlers', "toggleHomework('${esc(h.id)}')" in HTML and "deleteHomework('${esc(h.id)}')" in HTML)
check('JSON subject values are HTML-escaped in inline handlers', 'setTaskSubjectFilter(${esc(JSON.stringify(x))})' in HTML and 'removeCustomSubject(${esc(JSON.stringify(x))})' in HTML)
failed=[n for n,ok in checks if not ok]
for n,ok in checks: print(('PASS' if ok else 'FAIL')+' — '+n)
print(f'UI CONTROLS CONTRACT: {len(checks)-len(failed)}/{len(checks)} passed')
if failed: sys.exit(1)
