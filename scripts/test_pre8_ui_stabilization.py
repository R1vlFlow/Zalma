#!/usr/bin/env python3
"""Regression tests for the PRE8 universal UI/schedule stabilization layer."""
from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "index.html"

SELECT_IDS = [
    "taskSubject", "taskPriority", "materialSubjectFilter", "materialCourseFilter",
    "noteSubject", "notePriority", "specialty", "course", "officialCourse",
    "officialGroup", "hwPriority", "peCategory",
]


def fail(msg: str) -> None:
    raise SystemExit(f"PRE8 UI STABILIZATION FAILED: {msg}")


def extract_function(source: str, name: str, next_name: str) -> str:
    pattern = rf"function {re.escape(name)}\(schedule\)\{{([\s\S]*?)\n\}}\nfunction {re.escape(next_name)}"
    m = re.search(pattern, source)
    if not m:
        fail(f"cannot extract {name}()")
    return "function " + name + "(schedule){" + m.group(1) + "\n}"


def test_static_contract(source: str) -> None:
    if source.count("function renderToday(d){") != 1:
        fail("renderToday() is duplicated or missing")
    if source.count("function renderSchedule(){") != 1:
        fail("renderSchedule() is duplicated or missing")
    if source.count("function expandClientDoubleEvents(schedule){") != 1:
        fail("double-event normalizer is duplicated or missing")

    for sid in SELECT_IDS:
        if f'setupPremiumSelect("{sid}"' not in source:
            fail(f"premium select is not registered: {sid}")

    # The retired coarse-pointer hotfix must be absent. Keep the assertion narrow so unrelated
    # later CSS layers do not trigger false positives.
    if ".as-select-native{position:static!important;display:block!important" in source:
        fail("retired coarse-pointer fallback still exposes native selects")
    if ".as-select-trigger,.as-select-menu.as-select-portal{display:none!important" in source:
        fail("retired coarse-pointer CSS still hides premium select controls")

    sanitizer = re.search(r"function sanitizeActiveSchedule\(\)\{([\s\S]*?)\n\}", source)
    if not sanitizer:
        fail("sanitizeActiveSchedule() missing")
    sb = sanitizer.group(1)
    if "scheduleMode===\'weekly-block\'" not in sb or "e.weekday==null" not in sb:
        fail("schedule sanitizer must preserve weekly-block events with null weekday")

    # Touch/mobile interaction uses the browser's canonical click activation.
    # A preventDefault() pointerdown toggle was intentionally removed because it
    # could suppress the synthesized tap/click and leave the portal effectively unusable.
    if "trigger.addEventListener('pointerdown'" in source:
        fail("legacy pointerdown dropdown toggle still present")
    if "trigger.addEventListener('click'" not in source:
        fail("premium select trigger has no click/tap interaction")

    # No final display-level dedupe may collapse two identical-looking consecutive lessons.
    sanitizer = re.search(r"function sanitizeActiveSchedule\(\)\{([\s\S]*?)\n\}", source)
    if not sanitizer:
        fail("sanitizeActiveSchedule() missing")
    if "new Set" in sanitizer.group(0) or "seen.has(" in sanitizer.group(0):
        fail("schedule sanitizer still deduplicates events")
    render_sched = re.search(r"function renderSchedule\(\)\{([\s\S]*?)\n\}\nfunction renderDeadlineReminders", source)
    if not render_sched:
        fail("renderSchedule() body missing")
    body = render_sched.group(1)
    if "a.findIndex" in body or "gridEvents=[...new Set" in body:
        fail("renderSchedule() still contains risky display dedupe")
    if "ensureRenderableSchedule(data.schedule)" not in body:
        fail("renderSchedule() does not normalize schedule before rendering")

    if "double-badge" not in source or "double-event" not in source:
        fail("double lesson visual marker is missing")
    if 'personal-event-row personal-event-list-row' not in source:
        fail("personal event list is missing the styled row class")
    if 'renderToday(new Date(date+\'T12:00:00\'))' not in source:
        fail("saving a personal event does not refresh Today view")
    if 'dateInput.addEventListener(\'change\',renderPersonalEventList' not in source:
        fail("personal event list is not refreshed after changing event date")
    if 'return true;' not in source[source.find('function savePersonalEvent()'):source.find('function editPersonalEvent')]:
        fail("savePersonalEvent() has no explicit success result")

    if 'function changeScheduleWeek(delta)' not in source:
        fail("canonical week navigation helper is missing")
    if 'scheduleViewRevision++' not in source:
        fail("manual schedule navigation revision guard is missing")
    if 'const viewRevisionBefore=scheduleViewRevision' not in source or 'viewRevisionBefore===scheduleViewRevision' not in source:
        fail("auto-sync can still revert a manually selected week")
    if 'СИНХРОНИЗАЦИЯ ИСТОЧНИКА' in source or '>ИСТОЧНИК</div>' in source:
        fail("old 'Источник' wording remains in schedule settings")
    if 'Открыть официальный источник ↗' in source:
        fail("old schedule-settings link wording remains")
    if 'Проверяем официальный источник' in source or '>Источник</b>' in source:
        fail("schedule settings still contains source wording")
    if 'function personalEventCategoryLabel(category)' not in source:
        fail("personal event category label helper is missing")
    if 'function renderNotesList()' not in source:
        fail("notes list renderer is missing")
    if "let taskFilter='all'" not in source:
        fail("task filter state is missing")
    if 'version:"4.0.0-beta"' in source or '4.0.0-beta-' in source:
        fail("export still contains stale beta version")
    if "if(native.dataset.premiumReady==='1'){const existing=native.closest('.as-select');existing?._refresh?.();return existing;}" not in source:
        fail("premium selects cannot self-refresh after their native options change")

    # Universal layout guards for compact screens.
    for token in (
        '.section-head>*,.toolbar>*',
        '.toolbar,.section-head,.materials-hero,.bookmark-page-toolbar',
        '.btn{display:inline-flex!important;align-items:center!important',
    ):
        if token not in source:
            fail(f"universal layout guard missing: {token}")


def test_double_normalizer(source: str) -> None:
    fn = extract_function(source, "expandClientDoubleEvents", "ensureRenderableSchedule")
    js = f"""
const compareEvents=(a,b)=>String(a.start||'').localeCompare(String(b.start||''));
{fn}
const original={{weeks:[{{start:'2026-09-07',events:[
  {{id:'chem-1',weekday:0,start:'09:00',end:'12:25',subject:'Химия',group:'124',type:'practice'}},
  {{id:'ordinary',weekday:0,start:'13:30',end:'14:55',subject:'Анатомия',group:'124',type:'practice'}},
  {{id:'already-1',weekday:1,start:'09:20',end:'10:45',subject:'Сестринское дело',group:'124',type:'practice',double:true,doubleIndex:1,doubleOf:'pair'}}
]}}]}};
const once=expandClientDoubleEvents(JSON.parse(JSON.stringify(original)));
const events=once.weeks[0].events;
if(events.length!==4) throw new Error('expected 4 events after splitting one logical source, got '+events.length);
const pair=events.filter(e=>e.doubleOf==='chem-1');
if(pair.length!==2 || pair[0].start!=='09:00' || pair[0].end!=='10:35' || pair[1].start!=='10:50' || pair[1].end!=='12:25') throw new Error('unexpected split geometry for 09:00–12:25');
if(pair[0].doubleIndex!==1 || pair[1].doubleIndex!==2) throw new Error('double indices are not stable');
if(events.filter(e=>e.id==='already-1').length!==1) throw new Error('already-expanded pair was duplicated');
const twice=expandClientDoubleEvents(once);
if(twice.weeks[0].events.length!==events.length) throw new Error('normalizer is not idempotent');
console.log('double normalizer OK');
"""
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as f:
        f.write(js)
        path = f.name
    proc = subprocess.run(["node", path], cwd=ROOT, text=True, capture_output=True)
    Path(path).unlink(missing_ok=True)
    if proc.returncode:
        fail("double normalizer runtime test failed: " + (proc.stderr.strip() or proc.stdout.strip()))


def main() -> int:
    source = HTML.read_text(encoding="utf-8")
    test_static_contract(source)
    test_double_normalizer(source)
    print("PRE8 UI STABILIZATION: PASS")
    print(" - premium dropdowns: 12/12 covered")
    print(" - touch/native fallback: premium portal preserved")
    print(" - double lessons: split + idempotence verified")
    print(" - personal events: save/render/list refresh contract verified")
    print(" - compact layout: overflow/flex guards verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
