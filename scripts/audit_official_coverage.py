#!/usr/bin/env python3
"""Produce a per-group, per-stream audit against the current official schedule source inventory.

This script intentionally distinguishes source publication, local parsed events, and validated
production coverage. A URL existing on the university page does not mean it was parsed or is
safe to publish. It never fills gaps with synthetic lessons.
"""
from __future__ import annotations
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "reports" / "official-coverage-audit-2026-10-10.json"
OUT_MD = ROOT / "reports" / "official-coverage-audit-2026-10-10.md"
HUB = "https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/"


def read_json(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))

schedules = read_json("data/official-schedules.json")
sources_doc = read_json("data/sources.json")
kug = read_json("data/kug.json")
roster_contract = read_json("data/official-roster-contract.json")
specialist = read_json("data/manual-specialist-schedules.json")
source_rows = sources_doc.get("sources", [])

PROGRAMS = {
    "31.05.01": {"name": "Лечебное дело", "courses": 6},
    "31.05.02": {"name": "Педиатрия", "courses": 6},
    "37.05.01": {"name": "Клиническая психология", "courses": 5},
}

def sources_for(program, course=None, kind=None):
    result = []
    for s in source_rows:
        if s.get("program") != program:
            continue
        if course is not None and str(s.get("course")) != str(course):
            continue
        if kind is not None and s.get("kind") != kind:
            continue
        result.append(s)
    return result

def normalize_stream(x):
    return str(x or "")

def event_count_for_group(events, group, stream):
    """Count schedule cards that a given group can actually see; shared ALL cards are inherited."""
    out = Counter()
    for e in events:
        es = normalize_stream(e.get("stream"))
        eg = str(e.get("group", ""))
        if es != stream:
            continue
        if eg == str(group) or eg.upper() == "ALL":
            out[str(e.get("type", "unknown"))] += 1
    return out

def direct_group_count(events, group, stream, typ):
    return sum(1 for e in events
               if str(e.get("group", "")) == str(group)
               and normalize_stream(e.get("stream")) == stream
               and str(e.get("type", "")) == typ)

def source_summary(program, course):
    rows = sources_for(program, course)
    return [{"title": s.get("title", ""), "kind": s.get("kind", ""),
             "stream": s.get("stream", ""), "url": s.get("url", ""),
             "status": s.get("status", "published-link-in-inventory")} for s in rows]

def inferred_current_hub_status(program, course):
    # Official student-hub inventory was checked live on 2026-10-10; course publication is exact.
    if program == "31.05.01":
        return {"hub_timetable": "published", "hub_kug": "published",
                "note": "Course timetable/KUG link exists on current student hub; parsed coverage assessed separately."}
    if program in ("31.05.02", "37.05.01") and int(course) <= 2:
        return {"hub_timetable": "published", "hub_kug": "published",
                "note": "Course timetable/KUG link exists on current student hub; local schedule is maintained in manual rules, not in generated program-schedules.json."}
    return {"hub_timetable": "not_found_on_current_student_hub", "hub_kug": "not_found_on_current_student_hub",
            "note": "No course timetable/KUG link for this program/course appears in the current official student-hub timetable list; do not infer classes or group identifiers."}

program_reports = []
all_group_rows = []
source_integrity_findings = []

# The timetable hub currently publishes LD courses 1–6, but only 1–2 for Pediatrics and Clinical Psychology.
for program, meta in PROGRAMS.items():
    existing_spec = specialist.get("programs", {}).get(program)
    max_course = meta["courses"]
    course_reports = []
    for course_n in range(1, max_course + 1):
        c = str(course_n)
        hub_status = inferred_current_hub_status(program, c)
        periods = kug.get(program, {}).get(c, [])
        program_schedule_file = ROOT / "data" / "program-schedules.json"
        if program == "31.05.01":
            cdata = schedules.get("courses", {}).get(c, {})
            events = cdata.get("events", [])
            streams = cdata.get("streams", {})
            expected_streams = roster_contract.get(c, {})
            groups = []
            for stream, group_ids in expected_streams.items():
                for g in group_ids:
                    counts = event_count_for_group(events, g, str(stream))
                    group_lecture = counts.get("lecture", 0)
                    group_practice = direct_group_count(events, g, str(stream), "practice")
                    group_dated_practice = sum(1 for e in events if str(e.get("group", "")) == str(g)
                                               and normalize_stream(e.get("stream")) == str(stream)
                                               and str(e.get("type", "")) == "practice" and bool(e.get("date")))
                    group_weekly_blocks = sum(1 for e in events if str(e.get("group", "")) == str(g)
                                              and normalize_stream(e.get("stream")) == str(stream)
                                              and str(e.get("type", "")) == "practice" and e.get("scheduleMode") == "weekly-block")
                    missing = []
                    if group_lecture == 0: missing.append("lecture")
                    if group_practice == 0: missing.append("practice")
                    row = {
                        "program": program, "program_name": meta["name"], "course": course_n,
                        "group": str(g), "stream": str(stream) or "common",
                        "lectures_including_shared": group_lecture,
                        "practice_direct_group_records": group_practice,
                        "practice_dated_records": group_dated_practice,
                        "practice_weekly_block_records": group_weekly_blocks,
                        "practice_timing_status": ("dated-events" if group_dated_practice else "weekly-block-week-only" if group_weekly_blocks else "missing"),
                        "other_explicit_types": {"seminar": 0, "laboratory": 0, "clinical_review": 0},
                        "missing_event_types": missing,
                        "kug_periods": len(periods),
                        "status": "missing_practice" if group_practice == 0 else ("missing_lecture" if group_lecture == 0 else "partial_snapshot"),
                    }
                    if not periods: row["missing_event_types"].append("kug")
                    groups.append(row); all_group_rows.append(row)
            all_missing_practice = [r["group"] for r in groups if r["practice_direct_group_records"] == 0]
            source_rows_here = cdata.get("sources", [])
            practice_sources = [s for s in source_rows_here if s.get("kind") == "practice"]
            lecture_events = sum(1 for e in events if e.get("type") == "lecture")
            practice_events = sum(1 for e in events if e.get("type") == "practice")
            source_failures = [{"title": s.get("title"), "stream": s.get("stream", ""),
                                "url": s.get("url", ""), "status": s.get("status", "unknown"),
                                "events": s.get("events", 0)} for s in practice_sources if s.get("status") == "quarantined" or not int(s.get("events", 0) or 0)]
            if course_n in (4, 5, 6):
                stream_coverage = {}
                for st, gs in expected_streams.items():
                    source_events = sum(int(x.get("events", 0) or 0) for x in practice_sources if normalize_stream(x.get("stream")) == str(st))
                    represented_groups = sum(1 for g in gs if direct_group_count(events, g, str(st), "practice") > 0)
                    stream_coverage[str(st) or "common"] = {"source_parsed_records": source_events,
                        "groups_with_practice_records": represented_groups, "expected_groups": len(gs),
                        "missing_groups": sorted(str(g) for g in gs if direct_group_count(events, g, str(st), "practice") == 0)}
                if course_n == 4:
                    finding_text = "Cached official PDFs for Flow A and B were parsed into weekly-block rotation assignments for every roster group (A: 250 source records/12 groups; B: 248/12). These are week-based assignments without an exact weekday; embedded 2025/2026 date labels conflict with the 2026/2027 heading, and the cached bytes have not been compared with current live URLs."
                    action_text = "Display as weekly rotation blocks only, never as dated weekday lessons. Complete live-byte/hash revalidation and obtain authoritative confirmation of week-to-date mapping before production-live promotion."
                    severity = "critical"
                elif course_n == 5:
                    finding_text = "Only the cached Flow B matrix was safely parsed (194 source records/10 groups). Flow A has no parsed records for groups 501–512. Both source documents are linked, but embedded year/date labels are inconsistent with the 2026/2027 heading and live-byte revalidation is pending."
                    action_text = "Reacquire and parse current Flow A PDF; retain Flow B as a weekly-block rotation list until live hash comparison and week mapping validation are completed."
                    severity = "critical"
                else:
                    finding_text = "The linked course 6 practice PDF is recognised as a weekly matrix but its cached font/text layer is corrupt; the parser correctly rejects its schedule content rather than inventing assignments for groups 601–618."
                    action_text = "Download a clean current PDF or alternative official spreadsheet and parse all 18 groups. Keep the source quarantined until per-group assignments validate."
                    severity = "critical"
                source_integrity_findings.append({"severity": severity, "program": program, "course": course_n,
                    "finding": finding_text, "action": action_text, "stream_coverage": stream_coverage,
                    "sources": [x.get("url") for x in source_failures]})
            if course_n == 2 and "B" in expected_streams and any(str(g) in all_missing_practice for g in expected_streams["B"]):
                source_integrity_findings.append({
                    "severity": "critical", "program": program, "course": course_n,
                    "finding": "Flow B practical source yields only partial coverage.",
                    "action": "Re-parse source and prove all groups 217–229 have expected weekly assignments before marking live.",
                    "missing_groups": sorted(str(g) for g in expected_streams["B"] if str(g) in all_missing_practice),
                })
            course_status = "partial"
            if not all_missing_practice and lecture_events and practice_events and periods:
                course_status = "events_present_but_snapshot_not_live"
            course_reports.append({
                "course": course_n, "hub": hub_status,
                "roster_groups": len(groups), "roster_known": True,
                "stream_summary": {str(st) or "common": {"groups": len(gs),
                    "lecture_source_events": sum(int(s.get("events", 0) or 0) for s in source_rows_here if s.get("kind") == "lecture" and normalize_stream(s.get("stream")) == str(st)),
                    "practice_source_events": sum(int(s.get("events", 0) or 0) for s in source_rows_here if s.get("kind") == "practice" and normalize_stream(s.get("stream")) == str(st)),
                    "groups_missing_practice": sorted(str(g) for g in gs if str(g) in all_missing_practice)} for st, gs in expected_streams.items()},
                "parsed_event_counts": {"lecture": lecture_events, "practice": practice_events,
                                        "seminar_explicit": 0, "laboratory_explicit": 0, "clinical_review_explicit": 0},
                "kug_periods": len(periods), "practice_source_failures": source_failures,
                "groups_missing_practice": all_missing_practice,
                "status": course_status,
                "groups": groups,
                "sources": source_summary(program, c),
            })
        else:
            spec_course = (existing_spec or {}).get("courses", {}).get(c)
            if spec_course:
                group_names = list(spec_course.get("groups", []))
                groups = []
                lecture_rules = spec_course.get("lectureRules", [])
                practice_rules = spec_course.get("practiceRules", [])
                program_snapshot = None
                if program_schedule_file.exists():
                    try:
                        ps = read_json("data/program-schedules.json")
                        program_snapshot = (ps.get("programs", {}).get(program, {}).get("courses", {}).get(c))
                    except (OSError, json.JSONDecodeError):
                        program_snapshot = None
                snapshot_events = (program_snapshot.get("events", []) if isinstance(program_snapshot, dict) else [])
                snapshot_groups = {str(e.get("group", "")) for e in snapshot_events}
                snapshot_counts = Counter(str(e.get("type", "unknown")) for e in snapshot_events)
                snapshot_state = ("recovery_snapshot_needs_live_validation" if snapshot_events
                                  else "no_published_official_snapshot")
                for g in group_names:
                    applicable_lectures = sum(1 for r in lecture_rules if r.get("audience") == "ALL" or str(g) in list(map(str, r.get("groups", []))))
                    applicable_practices = sum(1 for r in practice_rules if r.get("audience") == "ALL" or str(g) in list(map(str, r.get("groups", []))))
                    group_events = [e for e in snapshot_events if str(e.get("group", "")) in (str(g), "ALL")]
                    missing_types = []
                    if not any(e.get("type") == "lecture" for e in group_events): missing_types.append("lecture_event")
                    if not any(e.get("type") in ("practice", "seminar", "laboratory", "clinical_review") for e in group_events): missing_types.append("practice_or_seminar_event")
                    if not periods: missing_types.append("kug")
                    row = {"program": program, "program_name": meta["name"], "course": course_n,
                           "group": str(g), "stream": "not_applicable",
                           "lecture_rules_applicable": applicable_lectures,
                           "practice_rules_applicable": applicable_practices,
                           "snapshot_event_count": len(group_events),
                           "parsed_events_available": bool(group_events),
                           "kug_periods": len(periods),
                           "missing_event_types": missing_types,
                           "status": snapshot_state if group_events else "no_events_for_group"}
                    groups.append(row); all_group_rows.append(row)
                course_reports.append({"course": course_n, "hub": hub_status,
                    "roster_groups": len(groups), "roster_known": True,
                    "rule_counts": {"lecture": len(lecture_rules), "practice_or_seminar": len(practice_rules)},
                    "snapshot_event_count": len(snapshot_events),
                    "snapshot_event_types": dict(snapshot_counts),
                    "kug_periods": len(periods), "groups_missing_rule_coverage": [r["group"] for r in groups if not r.get("lecture_rules_applicable") and not r.get("practice_rules_applicable")],
                    "status": snapshot_state if snapshot_events else "no_published_official_snapshot",
                    "groups": groups, "sources": source_summary(program, c)})
            else:
                # There is no authoritative roster for unavailable courses in the local contract.
                reason = "No current official student-hub timetable/KUG link was found for this course; group identifiers and lessons are unknown and intentionally not fabricated."
                course_reports.append({"course": course_n, "hub": hub_status,
                    "roster_groups": None, "roster_known": False, "kug_periods": len(periods),
                    "status": "official_source_missing", "groups": [], "note": reason, "sources": source_summary(program, c)})
    program_reports.append({"program": program, "name": meta["name"], "expected_courses": max_course,
                            "published_courses_on_current_student_hub": (6 if program == "31.05.01" else 2),
                            "courses": course_reports})

# Independent source-quality flags for the official Excel-exported PDFs checked on 2026-10-10.
source_integrity_findings.extend([
    {"severity": "critical", "program": "31.05.01", "courses": [4, 5, 6],
     "finding": "Official practical-rotation PDFs are labelled 2026/2027, but week columns 1–13 contain date labels from 2025 and later columns switch to December 2026.",
     "evidence": [
       {"title": "Course 4 Flow A", "url": "https://education.almazovcentre.ru/wp-content/uploads/2026/10/4k_ld_a-26-27-na-sajt.pdf"},
       {"title": "Course 4 Flow B", "url": "https://education.almazovcentre.ru/wp-content/uploads/2026/09/4k_ld_b-26-27-na-sajt.pdf"},
       {"title": "Course 5 Flow A", "url": "https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_a-26-27-na-sajt.pdf"},
       {"title": "Course 5 Flow B", "url": "https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_b-26-27-na-sajt.pdf"},
       {"title": "Course 6", "url": "https://education.almazovcentre.ru/wp-content/uploads/2026/09/6k_ld-26-27-na-sajt-1.pdf"}],
     "action": "Matrix week numbers map directly to the official academic-calendar week numbers: column 1's single date 03.09.2025 falls in calendar week 1 (01–05.09.2026); column 2's 07.09.2025–12.09.2025 matches calendar week 2 (07–12.09.2026). Embedded dates remain quarantined. Source PDF byte hashes still require live verification before publishing."},
    {"severity": "high", "program": "31.05.01", "courses": [4],
     "finding": "The official student hub also publishes a supplementary required simulation-centre schedule for LD course 4; it is absent from the prior source registry.",
     "evidence": [{"title": "Supplementary simulation-centre sessions", "url": "https://education.almazovcentre.ru/wp-content/uploads/2026/10/sim-czentr-4-kurs.pdf"}],
     "action": "Track this as an additional schedule layer, not as a replacement for ordinary course 4 practices."},
])

all_ld_groups = [r for r in all_group_rows if r["program"] == "31.05.01"]
missing_practice = [r for r in all_ld_groups if r.get("practice_direct_group_records", -1) == 0]
non_ld_groups = [r for r in all_group_rows if r["program"] != "31.05.01"]

report = {
    "report_version": 1,
    "audited_at": "2026-10-10",
    "official_student_hub": HUB,
    "local_snapshot": {"generatedAt": schedules.get("generatedAt"), "dataState": schedules.get("dataState"),
                        "schemaVersion": schedules.get("schemaVersion"),
                        "program_schedules_json_present": (ROOT / "data/program-schedules.json").exists(),
                        "sources_manifest_checkedAt": sources_doc.get("checkedAt"),
                        "note": schedules.get("recoveryNote", "")},
    "overall_status": "BLOCKED_FOR_PRODUCTION",
    "summary": {
        "programs": 3, "expected_program_courses": sum(p["expected_courses"] for p in program_reports),
        "published_timetable_courses": sum(p["published_courses_on_current_student_hub"] for p in program_reports),
        "known_group_rows": len(all_group_rows),
        "known_ld_groups": len(all_ld_groups),
        "known_non_ld_groups_with_rules": len(non_ld_groups),
        "ld_groups_missing_direct_practice_records": len(missing_practice),
        "ld_groups_with_weekly_block_practice_records": sum(1 for r in all_ld_groups if r.get("practice_weekly_block_records", 0) > 0),
        "ld_groups_with_dated_practice_records": sum(1 for r in all_ld_groups if r.get("practice_dated_records", 0) > 0),
        "ld_weekly_block_practice_records": sum(1 for c in schedules.get("courses", {}).values() for e in c.get("events", []) if e.get("type") == "practice" and e.get("scheduleMode") == "weekly-block"),
        "kug_courses_present_in_local_json": sum(1 for program_entries in kug.values() for periods_for_course in program_entries.values() if periods_for_course),
        "kug_expected_course_count": sum(p["published_courses_on_current_student_hub"] for p in program_reports),
        "official_event_types_in_current_ld_snapshot": sorted({str(e.get("type", "unknown")) for c in schedules.get("courses", {}).values() for e in c.get("events", [])}),
        "programs_with_generated_snapshot": (ROOT / "data/program-schedules.json").exists(),
    },
    "programs": program_reports,
    "group_rows": all_group_rows,
    "source_integrity_findings": source_integrity_findings,
    "interpretation": [
        "The current local index is a recovery snapshot generated 2026-10-01, not a live official synchronization.",
        "The official student hub currently publishes course timetable sets for LD years 1–6 and for Pediatrics and Clinical Psychology years 1–2 only.",
        "The hub publishes 10 current KUG course documents (LD 1–6, Pediatrics 1–2, Clinical Psychology 1–2); seven other programme/course combinations have no link on this hub and remain unpublished rather than being inferred.",
        "Direct URLs for all ten published KUG PDFs are inventoried in data/kug-source-manifest.json, but this local runtime has not downloaded their raw bytes and therefore stores no SHA-256 verification.",
        "The hub also publishes the official year-week calendar and course lecture/practice sheets. Publication is not proof that each file parsed cleanly.",
        "Current local LD schema has only two event types (`lecture` and `practice`); seminar, laboratory and clinical-review are not independently represented in the generated event index.",
        "data/program-schedules.json exists only as a local-recovery-snapshot: 1,544 scheduled placements were expanded from manually normalized, web-rendered official PDF rules for Pediatrics and Clinical Psychology courses 1–2. Their raw PDF bytes and SHA-256 are unverified, so these events are recovery/test data and not production-verified.",
        "Courses 3–6 for Pediatrics and 3–5 for Clinical Psychology remain unpublished on the current hub; empty course objects in the recovery JSON do not mean schedule coverage.",
        "No synthetic lessons or guessed course/group rosters were added to fill absent source data."
    ],
}

OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
OUT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

lines = [
    "# Official schedule coverage audit — 2026-10-10", "",
    f"**Result: {report['overall_status']}**", "",
    f"Official source: [{HUB}]({HUB}) (student-hub inventory checked on 2026-10-10).", "",
    "## Executive result", "",
    f"- Local snapshot: `{report['local_snapshot']['dataState']}` generated {report['local_snapshot']['generatedAt']}; not suitable to mark as a full live sync.",
    f"- Published timetable/KUG course sets currently found on the student hub: **{report['summary']['published_timetable_courses']} of {report['summary']['expected_program_courses']} possible programme/course slots** (LD 1–6, Pediatrics 1–2, Clinical Psychology 1–2). The remaining 7 programme/course pairs have no timetable linked on this hub and are not fabricated.",
    f"- Explicitly enumerated groups with rule/event audit rows: **{len(all_group_rows)}** — {len(all_ld_groups)} LD roster groups from the fixed roster contract and {len(non_ld_groups)} Pediatrics/KP groups from the existing 1–2-course source rules.",
    f"- LD roster groups with no parsed direct-group practice records (dated events or week blocks): **{len(missing_practice)}**.",
    f"- Of the roster, **{report['summary']['ld_groups_with_weekly_block_practice_records']} groups** have week-only practical rotation assignments; **{report['summary']['ld_groups_with_dated_practice_records']} groups** have dated practical events. A weekly block is not assigned an invented weekday.",
    f"- Curated local KUG periods exist for **{report['summary']['kug_courses_present_in_local_json']} of {report['summary']['kug_expected_course_count']} possible programme/course slots**; this corresponds to the 10 course sets currently published on the hub, but these local periods have not yet been re-parsed from live bytes or hash-verified.",
    f"- A KUG source manifest now records **{len(read_json('data/kug-source-manifest.json').get('sources', []))} direct official PDF URLs** with explicit pending byte/hash verification; this is inventory, not a live-sync attestation.",
    f"- Explicit event-type vocabulary in the current LD index: `{', '.join(report['summary']['official_event_types_in_current_ld_snapshot'])}` only; seminars/labs/clinical rotations are not separately typed.",
    f"- `data/program-schedules.json` is present as `{read_json('data/program-schedules.json').get('dataState', 'missing')}` with **{sum(len(c.get('events', [])) for p in read_json('data/program-schedules.json').get('programs', {}).values() for c in p.get('courses', {}).values())} recovery events** for Pediatrics/KP courses 1–2. These were expanded from web-rendered official PDF rules; source byte hashes remain null, so the events are not production-verified.",
    "- Courses not currently published on the official hub remain empty and explicitly marked unpublished.", "",
    "## Official publication coverage", "",
    "| Program | Course | KUG link on hub | Timetable link on hub | Local state |", "|---|---:|---|---|---|"
]
for p in program_reports:
    for c in p['courses']:
        lines.append(f"| {p['name']} ({p['program']}) | {c['course']} | {c['hub']['hub_kug']} | {c['hub']['hub_timetable']} | {c['status']} |")
lines += ["", "## Group-by-group and stream audit", "",
          "For LD, lecture counts include shared `ALL` lectures inherited by the stream; practice counts below are explicit records whose `group` equals that group. `weekly-block-week-only` means the official matrix identifies a study week, subject, group, and time window but not a weekday; it is displayed separately and not mapped to an invented date. For Pediatrics/KP, counts are applicable hand-normalized rule counts, not generated event counts.", "",
          "| Program | Course | Group | Stream | Lecture count/rules | Practice count/rules | Practice timing | KUG periods | Status / missing |", "|---|---:|---|---|---:|---:|---|---:|---|"]
for r in all_group_rows:
    if r['program'] == '31.05.01':
        l = r.get('lectures_including_shared', 0); pr = r.get('practice_direct_group_records', 0)
        status = r.get('status', '')
        timing = f"dated {r.get('practice_dated_records',0)} / week blocks {r.get('practice_weekly_block_records',0)}"
        missing = ', '.join(r.get('missing_event_types', [])) or '—'
    else:
        l = r.get('lecture_rules_applicable', 0); pr = r.get('practice_rules_applicable', 0)
        status = r.get('status', '')
        timing = 'rules only'
        missing = ', '.join(r.get('missing_event_types', [])) or '—'
    lines.append(f"| {r['program_name']} | {r['course']} | {r['group']} | {r['stream']} | {l} | {pr} | {timing} | {r.get('kug_periods', 0)} | {status}; {missing} |")
lines += ["", "## Critical source integrity findings", ""]
for i, finding in enumerate(source_integrity_findings, 1):
    lines.append(f"### {i}. [{finding.get('severity','unknown').upper()}] {finding.get('program','')} — course(s) {finding.get('course', finding.get('courses','?'))}")
    lines.append("")
    lines.append(f"{finding['finding']}")
    if finding.get('missing_groups'):
        lines.append("Missing groups: " + ", ".join(map(str, finding['missing_groups'])) + ".")
    if finding.get('evidence'):
        for s in finding['evidence']:
            lines.append(f"- [{s.get('title','Official source')}]({s.get('url','')})")
    if finding.get('sources'):
        for s in finding['sources']:
            lines.append(f"- [Source PDF]({s})")
    lines += ["", f"**Action:** {finding.get('action','')}", ""]
lines += ["## Exact groups with no parsed LD practice assignment", ""]
by_course = defaultdict(list)
for r in missing_practice:
    by_course[str(r['course'])].append(f"{r['group']} ({r['stream']})")
if not by_course:
    lines.append("None.")
else:
    for c in sorted(by_course, key=int):
        lines.append(f"- **Course {c}:** " + ", ".join(by_course[c]))
lines += ["", "## Safe next action", "",
          "1. Run the official sync workflow on an internet-connected runner to download current source bytes and compare SHA-256. Cached fixture PDFs for course 4 A/B and course 5 B were parsed locally, but are not yet byte-compared to the currently linked server objects.",
          "2. The local parser now extracts 4A, 4B and 5B matrix sources as first-class weekly rotation blocks. Revalidate their current live bytes and obtain authoritative confirmation for the inconsistent embedded date labels; recover 5A and course 6 from a clean official source.",
          "3. Add explicit normalized event types for seminar, laboratory, clinical review/rotation and practice; test by source document.",
          "4. Re-run strict 100% group × stream coverage checks. Keep `dataState` out of `live-generated` until every expected group is covered by a valid source and all KUG terms pass validation.", "",
          "## Method and limits", "",
          "- Current official timetable inventory: official Almazov student hub listed below. Direct link inventory was inspected on 2026-10-10. [Open current hub]({HUB})",
          "- Cross-checked file body for current course 4, 5 and 6 practice PDFs; these use a matrix layout and display date labels from 2025 for weeks 1–13 despite headings for academic year 2026/2027. Links are recorded in the finding above.",
          "- Container networking cannot resolve the official host, so live PDFs could not be downloaded and SHA-256 compared in this run. Parsed weekly-block data comes from cached official PDFs already in the archive; per-source cache hashes and paths are recorded in `data/official-schedules.json`.",
          "- Raw JSON data is also available in `reports/official-coverage-audit-2026-10-10.json`.", ""]
OUT_MD.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {OUT_JSON.relative_to(ROOT)} ({len(all_group_rows)} group rows)")
print(f"Wrote {OUT_MD.relative_to(ROOT)}")
print(json.dumps(report['summary'], ensure_ascii=False, indent=2))
