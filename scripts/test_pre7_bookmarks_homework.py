#!/usr/bin/env python3
"""PRE7 contracts: live double lessons, bookmarks and homework-to-next-pair."""
from __future__ import annotations
import re, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
checks=[]
def ck(name, ok):
    checks.append((name,bool(ok)))
# The official generator must actually invoke its long-block normalizer.
b=(ROOT/'scripts/build_official_schedule.py').read_text(encoding='utf-8')
ck('official builder invokes double lesson expansion', 'cc[\'events\']=expand_double_lesson_events(cc[\'events\'])' in b)
# Execute the canonical splitter on representative Almazov blocks.
import importlib.util
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('build_official_schedule',ROOT/'scripts/build_official_schedule.py')
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
for start,end,expected in [('09:00','12:25',[('09:00','10:35'),('10:50','12:25')]),('09:20','12:25',[('09:20','10:45'),('11:00','12:25')]),('13:30','16:55',[('13:30','15:05'),('15:20','16:55')]),('13:30','16:35',[('13:30','14:55'),('15:10','16:35')])]:
    got=[(e['start'],e['end']) for e in mod.expand_double_lesson_events([{'start':start,'end':end,'subject':'X','group':'123','weekNumber':2,'weekday':0}])]
    ck(f'double split {start}-{end}',got==expected)
ck('normal single pair preserved',[(e['start'],e['end']) for e in mod.expand_double_lesson_events([{'start':'09:00','end':'10:35','subject':'X'}])]==[('09:00','10:35')])
# Client event cards expose a persistent bookmark action and dedicated page.
ck('bookmark storage normalized', 'const bookmarks=Array.isArray(d.bookmarks)' in HTML)
ck('bookmark toggle exists', 'function toggleBookmark(' in HTML)
ck('bookmark page exists', 'id="bookmarks"' in HTML)
ck('bookmark navigation desktop/mobile', HTML.count('data-page="bookmarks"') >= 2)
ck('bookmark survives personal vault', 'bookmarks:data.bookmarks' in HTML)
ck('bookmark action rendered per event', 'toggleBookmark(${bookmarkArgs})' in HTML)
ck("bookmark key is stable across location changes", "String(event?.type||'')].join('|').toLowerCase()" in HTML)
ck('official client re-expands stale long blocks', 'weeks.forEach(w=>{w.events=expandClientDoubleEvents' in HTML)
# Homework is explicitly linked to the next occurrence of the same subject.
ck('next homework target resolver exists', 'function findNextHomeworkTarget(' in HTML)
ck('next target stored', 'targetEventKey:target?.key||\'\'' in HTML)
ck('next target displayed on target pair', 'function homeworkDueForEvent(' in HTML)
ck('next-pair control defaults in modal', 'id="hwNextPair" checked' in HTML)
ck('target hint rendered', 'refreshHomeworkTargetHint()' in HTML)
# Official source badge no longer says the opaque "ОФИЦ." label.
ck('opaque official label removed', 'class="sync-source-icon">ОФИЦ.' not in HTML)
# Release metadata
V=json.loads((ROOT/'version.json').read_text(encoding='utf-8'))
ck('release metadata pre7', V.get('version')=='4.3.0-pre7' and V.get('title')=='Almazov Student — PRE-RELEASE 2.0.1')
failed=[n for n,o in checks if not o]
for n,o in checks: print(('PASS' if o else 'FAIL')+' — '+n)
print(f'PRE7 BOOKMARK/HOMEWORK CONTRACT: {len(checks)-len(failed)}/{len(checks)} passed')
if failed:
    print('FAILED:\n - '+'\n - '.join(failed)); sys.exit(1)
