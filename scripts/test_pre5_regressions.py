#!/usr/bin/env python3
from pathlib import Path
import json,re,sys
root=Path(__file__).resolve().parents[1]
s=(root/'index.html').read_text(encoding='utf-8')
checks=[]
def ck(name,ok): checks.append((name,bool(ok)))
ck('release version pre5', json.loads((root/'package.json').read_text())['version']=='4.3.0-pre7')
ck('workflow version pre5', "SCHEDULE_ENGINE_VERSION: '4.3.0-pre7'" in (root/'.github/workflows/sync-official-schedules.yml').read_text())
wf=(root/'.github/workflows/sync-official-schedules.yml').read_text(encoding='utf-8')
ck('workflow has no heredoc', '<<' not in wf)
ck('workflow has no stale active version', all(v not in wf for v in ['4.1.1','4.3.0-pre2','4.3.0-pre3']))
ck('no stale runtime pre2 build', 'version:"4.3.0-pre2"' not in s)
ck('no live week hijack', 'scheduleViewDate=new Date(d);renderSchedule()' not in s)
ck('manual prev/next handlers remain', 'document.getElementById("prevWeek").onclick' in s and 'document.getElementById("nextWeek").onclick' in s)
ck('subject SVG renderer', 'function subjectIconSvg(code)' in s and 'lessonIcon(e.subject)' in s)
ck('mobile touch premium select', 'trigger.addEventListener(\'pointerdown\'' in s and '.as-select-native{position:absolute!important' in s and '.as-select-menu.as-select-portal.portal-open{display:block!important' in s and '.as-select-trigger{display:flex!important' in s)
ck('portal z-index', 'z-index:2147483647' in s)
ck('personal data merge remains', 'function mergeById' in s and 'function mergeNotes' in s)
ck('30 minute auto sync remains', '30*60*1000' in s)
# empty icon transformer must stay absent
ck('text-to-icon transformer absent', 'as-icon-system-js' not in s and 'window.AlmazovIcons' not in s)
failed=[n for n,o in checks if not o]
for i,(n,o) in enumerate(checks,1): print(f'{i:02d}. {"PASS" if o else "FAIL"} {n}')
print(f'PRE5 REGRESSION: {len(checks)-len(failed)}/{len(checks)} passed')
if failed: sys.exit(1)
