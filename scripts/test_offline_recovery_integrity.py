#!/usr/bin/env python3
"""Integrity checks for recovered local schedule snapshots without pretending live verification.

These checks are intentionally compatible with both local-recovery and live snapshots. They
validate safety properties for recovery data and stricter provenance properties for live data.
"""
from __future__ import annotations
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(rel: str):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))

def main() -> None:
    week_doc = read("data/academic-weeks-2026-2027.json")
    weeks = week_doc.get("weeks", [])
    week_map = {int(w["weekNumber"]): w for w in weeks}
    assert week_doc.get("academicYear") == "2026/2027"
    assert len(week_map) >= 20 and len(week_map) == len(weeks), "week map must be complete and uniquely numbered"
    assert week_map[2]["from"] == "2026-09-07" and week_map[2]["to"] == "2026-09-12"
    assert week_map[10]["from"] == "2026-11-02" and week_map[10]["to"] == "2026-11-07"
    assert any(x.get("code") == "HOLIDAY_DATE_YEAR_CONFLICT" for x in week_doc.get("limitations", []) if isinstance(x, dict)) \
        or any("31.12.2027" in json.dumps(x, ensure_ascii=False) for x in week_doc.get("limitations", [])) \
        or "31.12.2027" in json.dumps(week_doc.get("officialHolidayLabels", []), ensure_ascii=False), \
        "the official year-conflicting holiday label must be preserved as an anomaly"

    official = read("data/official-schedules.json")
    state = official.get("dataState")
    assert state in ("local-recovery-snapshot", "live-verified", "live-synced"), f"unknown schedule data state: {state}"
    weekly = []
    for course in official.get("courses", {}).values():
        for event in course.get("events", []):
            if event.get("scheduleMode") == "weekly-block":
                weekly.append(event)
                assert not event.get("date") and event.get("weekday") is None, "matrix blocks must never acquire guessed day/date"
                matrix_week = int(event.get("weekNumber", 0))
                calendar_week = matrix_week
                assert matrix_week >= 1 and calendar_week in week_map, "weekly matrix column does not map to an official calendar week"
                assert event.get("matrixWeekNumber") == matrix_week, "raw matrix week number must remain traceable"
                assert event.get("calendarWeekNumber") == calendar_week and event.get("weekCalendarOffset") == 0, \
                    "matrix columns must retain their official week number"
                week = week_map[calendar_week]
                assert event.get("weekRangeStart") == week["from"] and event.get("weekRangeEnd") == week["to"], \
                    "weekly block date ranges must use the same-numbered official calendar week, never stale embedded labels"
    if state == "local-recovery-snapshot":
        by_course_stream = {}
        for course_no, course in official.get("courses", {}).items():
            for e in course.get("events", []):
                if e.get("type") == "practice" and e.get("scheduleMode") == "weekly-block":
                    k = (str(course_no), str(e.get("stream") or ""))
                    by_course_stream[k] = by_course_stream.get(k, 0) + 1
        assert by_course_stream.get(("4", "A")) == 250
        assert by_course_stream.get(("4", "B")) == 248
        assert by_course_stream.get(("5", "B")) == 194
        assert len(weekly) == 692, f"unexpected weekly blocks in local recovery: {len(weekly)}"
        assert all(e.get("weekCalendarStatus") == "web-text-reviewed-byte-unverified" for e in weekly)
        assert all(e.get('calendarWeekNumber') == 1 for e in weekly if int(e.get('weekNumber', 0)) == 1), \
            "matrix column 1 must map to academic calendar week 1, not week 2"
        assert all(e.get('weekRangeStart') == '2026-09-01' and e.get('weekRangeEnd') == '2026-09-05' \
                   for e in weekly if int(e.get('weekNumber', 0)) == 1), "matrix column 1 range mismatch"
        # Weak/partial streams are explicitly recorded and never presented as full coverage.
        src = {str(c): official["courses"][str(c)].get("sources", []) for c in (2, 5, 6)}
        two_b = next((x for x in src["2"] if x.get("kind") == "practice" and x.get("stream") == "B"), {})
        five_a = next((x for x in src["5"] if x.get("kind") == "practice" and x.get("stream") == "A"), {})
        six_practice = next((x for x in src["6"] if x.get("kind") == "practice"), {})
        assert int(two_b.get("events", 0)) == 12 and two_b.get("sha256") is None
        assert int(five_a.get("events", 0)) == 0 and five_a.get("status") == "quarantined"
        assert int(six_practice.get("events", 0)) == 0 and six_practice.get("status") == "quarantined"

    specialist = read("data/program-schedules.json")
    spec_state = specialist.get("dataState")
    spec_events = [e for p in specialist.get("programs", {}).values() for c in p.get("courses", {}).values() for e in c.get("events", [])]
    if spec_state == "local-recovery-snapshot":
        assert len(spec_events) == 1544, f"expected reviewed recovery expansion, got {len(spec_events)}"
        assert all(e.get("sourceVerification") == "web-text-reviewed-byte-unverified" for e in spec_events)
        assert all(e.get("weekCalendarStatus") == "web-text-reviewed-byte-unverified" for e in spec_events)
        assert not any(str(e.get("sourceUrl", "")).startswith("fixture://") for e in spec_events)
        p2 = specialist["programs"]["31.05.02"]["courses"]["2"]
        assert any(e.get("type") == "lecture" and e.get("sourceMetadataException") == "OFFICIAL_PEDS2_LECTURE_TITLE_MISLABEL" for e in p2["events"])
        for program, course_no in (("31.05.02", "3"), ("37.05.01", "3")):
            course = specialist["programs"][program]["courses"][course_no]
            assert course.get("status") == "unpublished" and not course.get("events"), "unpublished courses must remain empty"
        for e in spec_events:
            week = week_map[int(e["weekNumber"])]
            assert week["from"] <= e["date"] <= week["to"], "recovered date is outside its official week"
    elif spec_state:
        assert all(e.get("sourceVerification") in ("live-byte-verified", "hash-verified") for e in spec_events), \
            "non-recovery schedule events must carry live/hash-verified provenance"

    print(json.dumps({
        "result": "PASS",
        "academicWeeks": len(week_map),
        "weeklyBlockAssignments": len(weekly),
        "officialScheduleState": state,
        "specialistScheduleState": spec_state,
        "specialistRecoveryEvents": len(spec_events),
        "productionClaim": "not-granted-by-this-test",
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
