#!/usr/bin/env python3
"""Real-source regression for the new 4th-course B practice matrix.

The fixture is the official Almazov PDF supplied for this release. The test
checks the semantic structure that matters to the app: all 12 groups, the
fixed practice time, weekly (not invented daily) events, correct multi-slot
week expansion, and clean subject/location separation.
"""
from pathlib import Path
import importlib.util
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "tests" / "fixtures" / "4k_ld_b_2026_2027.pdf"
spec = importlib.util.spec_from_file_location("build", ROOT / "scripts" / "build_official_schedule.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

raw = PDF.read_bytes()
events = mod.parse_practice(raw, 4, "fixture://4k_ld_b_2026_2027.pdf", "B")

expected_groups = {str(x) for x in range(413, 425)}
got_groups = {str(e.get("group")) for e in events}
assert got_groups == expected_groups, (got_groups, expected_groups)
assert events, "4B fixture produced no practice events"
assert all(e.get("stream") == "B" for e in events)
assert all(e.get("type") == "practice" for e in events)
assert all(e.get("weekday") is None for e in events), "matrix parser invented a weekday"
assert all(e.get("scheduleMode") == "weekly-block" for e in events)
assert all((e.get("start"), e.get("end")) == ("13:30", "16:55") for e in events)
assert all(1 <= int(e.get("weekNumber", 0)) <= 16 for e in events)

# No row may inherit a neighbouring group's room/subject.
for e in events:
    subject = str(e.get("subject") or "").strip()
    location = str(e.get("location") or "")
    assert subject and len(subject) > 1
    assert subject not in location, (e["group"], e["weekNumber"], subject, location)
    assert "  " not in location

assert all("диагност ика" not in str(e["subject"]) for e in events)
assert all("диагностик а" not in str(e["subject"]) for e in events)

# High-value semantic regression for the first row visible in the source PDF.
# The official matrix has two internal subcolumns inside many weeks; therefore
# a group can legitimately have two different practice subjects in one week.
by_group_week = defaultdict(list)
for e in events:
    by_group_week[(str(e["group"]), int(e["weekNumber"]))].append(e["subject"])

def subjects(group, week):
    return sorted(by_group_week[(str(group), int(week))])

assert subjects("413", 1) == ["Внутренние болезни"]
assert subjects("413", 2) == ["Внутренние болезни"]
assert subjects("413", 3) == ["Внутренние болезни"]
assert subjects("413", 4) == ["Медицинская реабилитация и спортивная медицина"]
assert subjects("413", 5) == ["Ургентная хирургия"]
assert subjects("413", 6) == ["Ургентная хирургия"]
assert subjects("413", 7) == ["Офтальмология"]
assert subjects("413", 8) == ["Гинекология"]
assert subjects("413", 9) == ["Гинекология"]
assert subjects("413", 10) == ["Урология"]
assert subjects("413", 11) == ["Урология", "Эндокринология"]
assert subjects("413", 12) == ["Неврология"]
assert subjects("413", 13) == ["Дерматовенерология клиническая", "Неврология"]
assert subjects("413", 14) == ["Дерматовенерология клиническая", "Лучевая диагностика"]
assert subjects("413", 15) == ["ОСК"]

# A second row catches the most common cross-row contamination failure.
assert subjects("414", 4) == ["Медицинская реабилитация и спортивная медицина"]
assert subjects("414", 11) == ["Урология", "Эндокринология"]
assert subjects("414", 14) == ["Дерматовенерология клиническая", "Лучевая диагностика"]

counts = Counter(str(e["group"]) for e in events)
assert min(counts.values()) >= 18, counts

print(f"4K REAL MATRIX REGRESSION: PASS — {len(events)} events, 12 groups, multi-slot weeks preserved.")
