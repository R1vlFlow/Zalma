#!/usr/bin/env python3
"""Geometry regression for the 4–6 weekly matrix parser.

Uses PyMuPDF to build a tiny in-memory spreadsheet-like PDF. It verifies the
production parser expands merged cells to every week and preserves every group.
No network and no real university data are required.
"""
from pathlib import Path
import fitz, sys, importlib.util

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("build", ROOT/"scripts/build_official_schedule.py")
mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

def make_fixture(course, stream, groups):
    doc=fitz.open()
    for page_groups in (groups[:len(groups)//2], groups[len(groups)//2:]):
        page=doc.new_page(width=842,height=800)
        page.insert_text((30,25),"РАСПИСАНИЕ занятий семинарского типа")
        page.insert_text((30,40),f"{course} курс, поток {stream or '—'}")
        page.insert_text((30,55),"Время занятий семинарского типа: 09:00 - 12:25")
        left,top=30,150
        group_w=42; week_w=45; row_h=48
        for i in range(16):
            x=left+group_w+i*week_w
            page.draw_rect(fitz.Rect(x,top,x+week_w,top+20))
            page.insert_text((x+18,top+14),str(i+1))
        for ri,g in enumerate(page_groups):
            y=top+20+ri*row_h
            page.draw_rect(fitz.Rect(left,y,left+group_w,y+row_h))
            page.insert_text((left+8,y+27),g)
            spans=[(0,4,"Medicine КПК, aud.101"),
                   (4,9,"Surgery Башня, aud.20"),
                   (9,14,"Infectious КПК, aud.301")]
            for a,b,text in spans:
                x=left+group_w+a*week_w
                page.draw_rect(fitz.Rect(x,y,x+(b-a)*week_w,y+row_h))
                page.insert_text((x+5,y+27),text)
    return doc.tobytes()

def check(course, stream, groups):
    raw=make_fixture(course,stream,groups)
    events=mod.parse_week_matrix_coordinate(raw,course,f"fixture-{course}-{stream}.pdf",stream)
    if len(events) < len(groups)*14:
        raise AssertionError(f"{course}/{stream}: only {len(events)} matrix events")
    got_groups={str(e["group"]) for e in events}
    if got_groups!=set(groups):
        raise AssertionError(f"{course}/{stream}: groups mismatch {got_groups} != {set(groups)}")
    for g in groups:
        weeks={int(e["weekNumber"]) for e in events if str(e["group"])==g}
        if len(weeks) < 14:
            raise AssertionError(f"{course}/{stream}/{g}: only {len(weeks)} weekly columns recovered")
    if any(e.get("weekday") is not None for e in events):
        raise AssertionError(f"{course}/{stream}: matrix events invented weekdays")

check(4,"A",["401","402","403","404"])
check(5,"B",["513","514","515","516"])
check(6,"",["601","602","603","604"])
print("MATRIX GEOMETRY REGRESSION: PASS — merged 4–6 cells expand correctly without invented weekdays.")
