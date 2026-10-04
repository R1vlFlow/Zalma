#!/usr/bin/env python3
"""Pre-release stability regression gate for the schedule/UI hotfix."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'index.html').read_text(encoding='utf-8')
WF = (ROOT / '.github' / 'workflows' / 'sync-official-schedules.yml').read_text(encoding='utf-8')
REQ = (ROOT / 'requirements-official-sync.txt').read_text(encoding='utf-8')

checks = []
def check(name, ok):
    checks.append((name, bool(ok)))

check('PyYAML dependency installed by workflow requirements', 'PyYAML==6.0.2' in REQ)
check('workflow installs requirements before YAML test', 'pip install -r requirements-official-sync.txt' in WF)
check('date sanitizer uses real YYYY-MM-DD regex', r'/^\d{4}-\d{2}-\d{2}$/' in HTML)
check('schedule sanitizer is not run every render', 'sanitizedScheduleObjects.has(data.schedule)' in HTML)
check('schedule renderer no longer runs every 60 seconds', 'setInterval(()=>{try{renderSchedule()}catch(e){}},60000)' not in HTML)
check('manual week navigation remains', 'prevWeek' in HTML and 'nextWeek' in HTML)
check('manual week navigation is not overwritten by live layer', '__liveWeekKey="__manual__"' in HTML)
check('auto sync preserves selected week', 'const viewBefore=new Date(scheduleViewDate)' in HTML and 'targetWeek=isoDate(startOfWeek(viewBefore))' in HTML)
check('mobile premium select remains active', '.as-select-native{position:absolute!important' in HTML and '.as-select-trigger{display:flex!important' in HTML and "trigger.addEventListener('click'" in HTML and "trigger.addEventListener('pointerdown'" not in HTML)
check('desktop custom portal remains active', '.as-select-menu.as-select-portal.portal-open' in HTML and 'z-index:2147483647!important' in HTML)
check('subject icons rendered inside schedule cards', 'event-subject-icon' in HTML and '${lessonIcon(e.subject)}' in HTML)
check('live layer only rebuilds today block on day change', 'if(__liveDayKey!==dayKey)' in HTML and 'renderToday(d)' in HTML)
check('next lesson search is cached by minute', '__nextLessonCache' in HTML and "Math.floor(now.getTime()/60000)" in HTML)
check('quote initializer is idempotent', '__ALMAZOV_QUOTES_STARTED' in HTML)
check('official sync listener is bound once', 'officialSyncBound' in HTML)
check('duplicate live failsafe removed', 'as-live-failsafe' not in HTML)
check('no heredoc remains in workflow', '<<' not in WF)

failed = [name for name, ok in checks if not ok]
print(f'STABILITY HOTFIX TESTS: {len(checks)-len(failed)}/{len(checks)} passed')
if failed:
    print('FAILED:')
    for name in failed:
        print(' -', name)
    raise SystemExit(1)
