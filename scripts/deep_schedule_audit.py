#!/usr/bin/env python3
"""Deep generated-index audit for Almazov Student.

This is intentionally stricter than the lightweight schema checks. It verifies
that the generated 1–6 index is internally coherent enough to publish:
rosters, stream coverage, event coverage, week dates, duplicate semantics and
source roles are all checked together.
"""
from pathlib import Path
import json, re, datetime, sys

ROOT=Path(__file__).resolve().parents[1]
DATA=json.loads((ROOT/"data/official-schedules.json").read_text(encoding="utf-8"))
if DATA.get("dataState") == "bootstrap-pending":
    print("DEEP SCHEDULE AUDIT: OK — bootstrap-pending; strict event audit is deferred to the first live GitHub synchronization.")
    raise SystemExit(0)
if DATA.get("dataState") not in {None, "live-generated"}:
    print(f"DEEP SCHEDULE AUDIT: FAILED\n - unsupported dataState={DATA.get('dataState')!r}")
    raise SystemExit(1)
COURSES=DATA.get("courses", {})
EXPECTED={
    "1":{"A":[str(x) for x in range(101,123)],"B":[str(x) for x in range(123,136)]},
    "2":{"A":[str(x) for x in range(201,217)],"B":[str(x) for x in range(217,230)]},
    "3":{"A":[str(x) for x in range(301,313)],"B":[str(x) for x in range(313,323)]},
    "4":{"A":[str(x) for x in range(401,413)],"B":[str(x) for x in range(413,425)]},
    "5":{"A":[str(x) for x in range(501,513)],"B":[str(x) for x in range(513,523)]},
    "6":{"":[str(x) for x in range(601,619)]},
}
START=datetime.date(2026,8,31)
errors=[]; warnings=[]

def week_start(n):
    return START+datetime.timedelta(days=7*(int(n)-1))

if DATA.get("schemaVersion") != 7:
    errors.append(f"schemaVersion={DATA.get('schemaVersion')!r}, expected 7")
if set(COURSES) != set(EXPECTED):
    errors.append(f"course set mismatch: {sorted(COURSES)}")

for cid,streams in EXPECTED.items():
    c=COURSES.get(cid,{})
    events=c.get("events",[]) if isinstance(c.get("events"),list) else []
    sources=c.get("sources",[]) if isinstance(c.get("sources"),list) else []
    actual_groups=set(map(str,c.get("groups",[])))
    expected_groups={g for gs in streams.values() for g in gs}
    if actual_groups != expected_groups:
        errors.append(f"{cid}: roster mismatch missing={sorted(expected_groups-actual_groups)} extra={sorted(actual_groups-expected_groups)}")
    expected_streams=set(streams)
    actual_streams=set(c.get("streams",{}))
    if actual_streams != expected_streams:
        errors.append(f"{cid}: stream keys {sorted(actual_streams)} != {sorted(expected_streams)}")

    type_counts={"lecture":0,"practice":0}
    group_practice=set()
    seen=set()
    for e in events:
        typ=e.get("type")
        if typ in type_counts: type_counts[typ]+=1
        if typ=="practice":
            g=str(e.get("group",""))
            group_practice.add(g)
            if g not in expected_groups: errors.append(f"{cid}: practice has unexpected group {g}")
        if typ=="lecture" and e.get("group")!="ALL":
            errors.append(f"{cid}: lecture event is group-specific: {e.get('group')!r}")
        st=str(e.get("stream",""))
        if st not in expected_streams:
            errors.append(f"{cid}: event has unexpected stream {st!r}")
        wk=e.get("weekNumber")
        if not isinstance(wk,int) or wk<1 or wk>52:
            errors.append(f"{cid}: invalid weekNumber {wk!r}")
        else:
            expected_ws=week_start(wk).isoformat()
            if e.get("weekStart") and e.get("weekStart") != expected_ws:
                errors.append(f"{cid}: week {wk} has weekStart={e.get('weekStart')} expected {expected_ws}")
        for key in ("start","end"):
            if not re.fullmatch(r"\d{2}:\d{2}",str(e.get(key,""))):
                errors.append(f"{cid}: invalid {key}={e.get(key)!r}")
        key=(typ,st,str(e.get("group")),wk,e.get("weekday"),e.get("start"),e.get("end"),e.get("subject"),e.get("location"))
        if key in seen:
            errors.append(f"{cid}: semantic duplicate {key}")
        seen.add(key)
        loc=str(e.get("location",""))
        if "Заведующий Отделом" in loc or "________________" in loc:
            warnings.append(f"{cid}: footer text leaked into location for {e.get('subject')!r}")

    if not events:
        errors.append(f"{cid}: no events")
    if type_counts["lecture"]==0:
        errors.append(f"{cid}: lecture events missing")
    if type_counts["practice"]==0:
        errors.append(f"{cid}: practice events missing")

    for st,groups in streams.items():
        listed=set(map(str,c.get("streams",{}).get(st,[])))
        if listed != set(groups):
            errors.append(f"{cid}/{st or 'NONE'}: stream roster mismatch")
        missing=set(groups)-group_practice
        if missing:
            errors.append(f"{cid}/{st or 'NONE'}: practice missing for groups {sorted(missing)}")
        if not any(e.get("type")=="lecture" and str(e.get("stream",""))==st for e in events):
            errors.append(f"{cid}/{st or 'NONE'}: lecture source/events missing")
        if not any(e.get("type")=="practice" and str(e.get("stream",""))==st for e in events):
            errors.append(f"{cid}/{st or 'NONE'}: practice source/events missing")

    roles={(str(s.get("kind")),str(s.get("stream",""))) for s in sources}
    for st in streams:
        if ("lecture",st) not in roles: errors.append(f"{cid}/{st or 'NONE'}: lecture source missing")
        if ("practice",st) not in roles: errors.append(f"{cid}/{st or 'NONE'}: practice source missing")
    for s in sources:
        if int(s.get("events",0)) < 0: errors.append(f"{cid}: negative source event count")

if warnings:
    print("DEEP SCHEDULE AUDIT WARNINGS:")
    for w in warnings[:50]: print(" -",w)
if errors:
    print("DEEP SCHEDULE AUDIT: FAILED")
    for e in errors: print(" -",e)
    raise SystemExit(1)
print("DEEP SCHEDULE AUDIT: PASS — 1–6 rosters, streams, event coverage, dates, duplicates and source roles are coherent.")
