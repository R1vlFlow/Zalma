# Official schedule coverage audit — 2026-10-10

**Result: BLOCKED_FOR_PRODUCTION**

Official source: [https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/](https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/) (student-hub inventory checked on 2026-10-10).

## Executive result

- Local snapshot: `local-recovery-snapshot` generated 2026-10-10T20:00:00+00:00; not suitable to mark as a full live sync.
- Published timetable/KUG course sets currently found on the student hub: **10 of 17 possible programme/course slots** (LD 1–6, Pediatrics 1–2, Clinical Psychology 1–2). The remaining 7 programme/course pairs have no timetable linked on this hub and are not fabricated.
- Explicitly enumerated groups with rule/event audit rows: **164** — 150 LD roster groups from the fixed roster contract and 14 Pediatrics/KP groups from the existing 1–2-course source rules.
- LD roster groups with no parsed direct-group practice records (dated events or week blocks): **42**.
- Of the roster, **34 groups** have week-only practical rotation assignments; **74 groups** have dated practical events. A weekly block is not assigned an invented weekday.
- Curated local KUG periods exist for **10 of 10 possible programme/course slots**; this corresponds to the 10 course sets currently published on the hub, but these local periods have not yet been re-parsed from live bytes or hash-verified.
- A KUG source manifest now records **10 direct official PDF URLs** with explicit pending byte/hash verification; this is inventory, not a live-sync attestation.
- Explicit event-type vocabulary in the current LD index: `lecture, practice` only; seminars/labs/clinical rotations are not separately typed.
- `data/program-schedules.json` is present as `local-recovery-snapshot` with **1544 recovery events** for Pediatrics/KP courses 1–2. These were expanded from web-rendered official PDF rules; source byte hashes remain null, so the events are not production-verified.
- Courses not currently published on the official hub remain empty and explicitly marked unpublished.

## Official publication coverage

| Program | Course | KUG link on hub | Timetable link on hub | Local state |
|---|---:|---|---|---|
| Лечебное дело (31.05.01) | 1 | published | published | partial |
| Лечебное дело (31.05.01) | 2 | published | published | partial |
| Лечебное дело (31.05.01) | 3 | published | published | events_present_but_snapshot_not_live |
| Лечебное дело (31.05.01) | 4 | published | published | events_present_but_snapshot_not_live |
| Лечебное дело (31.05.01) | 5 | published | published | partial |
| Лечебное дело (31.05.01) | 6 | published | published | partial |
| Педиатрия (31.05.02) | 1 | published | published | recovery_snapshot_needs_live_validation |
| Педиатрия (31.05.02) | 2 | published | published | recovery_snapshot_needs_live_validation |
| Педиатрия (31.05.02) | 3 | not_found_on_current_student_hub | not_found_on_current_student_hub | official_source_missing |
| Педиатрия (31.05.02) | 4 | not_found_on_current_student_hub | not_found_on_current_student_hub | official_source_missing |
| Педиатрия (31.05.02) | 5 | not_found_on_current_student_hub | not_found_on_current_student_hub | official_source_missing |
| Педиатрия (31.05.02) | 6 | not_found_on_current_student_hub | not_found_on_current_student_hub | official_source_missing |
| Клиническая психология (37.05.01) | 1 | published | published | recovery_snapshot_needs_live_validation |
| Клиническая психология (37.05.01) | 2 | published | published | recovery_snapshot_needs_live_validation |
| Клиническая психология (37.05.01) | 3 | not_found_on_current_student_hub | not_found_on_current_student_hub | official_source_missing |
| Клиническая психология (37.05.01) | 4 | not_found_on_current_student_hub | not_found_on_current_student_hub | official_source_missing |
| Клиническая психология (37.05.01) | 5 | not_found_on_current_student_hub | not_found_on_current_student_hub | official_source_missing |

## Group-by-group and stream audit

For LD, lecture counts include shared `ALL` lectures inherited by the stream; practice counts below are explicit records whose `group` equals that group. `weekly-block-week-only` means the official matrix identifies a study week, subject, group, and time window but not a weekday; it is displayed separately and not mapped to an invented date. For Pediatrics/KP, counts are applicable hand-normalized rule counts, not generated event counts.

| Program | Course | Group | Stream | Lecture count/rules | Practice count/rules | Practice timing | KUG periods | Status / missing |
|---|---:|---|---|---:|---:|---|---:|---|
| Лечебное дело | 1 | 101 | A | 86 | 21 | dated 21 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 102 | A | 86 | 12 | dated 12 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 103 | A | 86 | 0 | dated 0 / week blocks 0 | 8 | missing_practice; practice |
| Лечебное дело | 1 | 104 | A | 86 | 15 | dated 15 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 105 | A | 86 | 6 | dated 6 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 106 | A | 86 | 6 | dated 6 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 107 | A | 86 | 6 | dated 6 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 108 | A | 86 | 6 | dated 6 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 109 | A | 86 | 18 | dated 18 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 110 | A | 86 | 3 | dated 3 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 111 | A | 86 | 14 | dated 14 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 112 | A | 86 | 9 | dated 9 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 113 | A | 86 | 3 | dated 3 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 114 | A | 86 | 3 | dated 3 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 115 | A | 86 | 3 | dated 3 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 116 | A | 86 | 3 | dated 3 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 117 | A | 86 | 10 | dated 10 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 118 | A | 86 | 10 | dated 10 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 119 | A | 86 | 9 | dated 9 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 120 | A | 86 | 9 | dated 9 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 121 | A | 86 | 9 | dated 9 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 122 | A | 86 | 9 | dated 9 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 123 | B | 86 | 175 | dated 175 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 124 | B | 86 | 175 | dated 175 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 125 | B | 86 | 126 | dated 126 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 126 | B | 86 | 140 | dated 140 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 127 | B | 86 | 134 | dated 134 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 128 | B | 86 | 134 | dated 134 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 129 | B | 86 | 135 | dated 135 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 130 | B | 86 | 135 | dated 135 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 131 | B | 86 | 135 | dated 135 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 132 | B | 86 | 135 | dated 135 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 133 | B | 86 | 136 | dated 136 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 134 | B | 86 | 136 | dated 136 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 1 | 135 | B | 86 | 132 | dated 132 / week blocks 0 | 8 | partial_snapshot; — |
| Лечебное дело | 2 | 201 | A | 81 | 26 | dated 26 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 202 | A | 81 | 26 | dated 26 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 203 | A | 81 | 20 | dated 20 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 204 | A | 81 | 20 | dated 20 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 205 | A | 81 | 20 | dated 20 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 206 | A | 81 | 20 | dated 20 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 207 | A | 81 | 30 | dated 30 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 208 | A | 81 | 30 | dated 30 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 209 | A | 81 | 30 | dated 30 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 210 | A | 81 | 30 | dated 30 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 211 | A | 81 | 14 | dated 14 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 212 | A | 81 | 14 | dated 14 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 213 | A | 81 | 6 | dated 6 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 214 | A | 81 | 6 | dated 6 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 215 | A | 81 | 6 | dated 6 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 216 | A | 81 | 6 | dated 6 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 217 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 218 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 219 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 220 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 221 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 222 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 223 | B | 81 | 6 | dated 6 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 224 | B | 81 | 6 | dated 6 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 2 | 225 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 226 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 227 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 228 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 2 | 229 | B | 81 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 3 | 301 | A | 89 | 15 | dated 15 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 302 | A | 89 | 15 | dated 15 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 303 | A | 89 | 10 | dated 10 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 304 | A | 89 | 10 | dated 10 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 305 | A | 89 | 15 | dated 15 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 306 | A | 89 | 15 | dated 15 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 307 | A | 89 | 22 | dated 22 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 308 | A | 89 | 22 | dated 22 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 309 | A | 89 | 3 | dated 3 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 310 | A | 89 | 3 | dated 3 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 311 | A | 89 | 13 | dated 13 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 312 | A | 89 | 13 | dated 13 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 313 | B | 89 | 12 | dated 12 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 314 | B | 89 | 12 | dated 12 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 315 | B | 89 | 1 | dated 1 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 316 | B | 89 | 1 | dated 1 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 317 | B | 89 | 11 | dated 11 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 318 | B | 89 | 11 | dated 11 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 319 | B | 89 | 15 | dated 15 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 320 | B | 89 | 15 | dated 15 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 321 | B | 89 | 1 | dated 1 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 3 | 322 | B | 89 | 1 | dated 1 / week blocks 0 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 401 | A | 72 | 18 | dated 0 / week blocks 18 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 402 | A | 72 | 18 | dated 0 / week blocks 18 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 403 | A | 72 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 404 | A | 72 | 21 | dated 0 / week blocks 21 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 405 | A | 72 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 406 | A | 72 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 407 | A | 72 | 20 | dated 0 / week blocks 20 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 408 | A | 72 | 20 | dated 0 / week blocks 20 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 409 | A | 72 | 23 | dated 0 / week blocks 23 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 410 | A | 72 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 411 | A | 72 | 21 | dated 0 / week blocks 21 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 412 | A | 72 | 21 | dated 0 / week blocks 21 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 413 | B | 72 | 18 | dated 0 / week blocks 18 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 414 | B | 72 | 18 | dated 0 / week blocks 18 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 415 | B | 72 | 21 | dated 0 / week blocks 21 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 416 | B | 72 | 21 | dated 0 / week blocks 21 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 417 | B | 72 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 418 | B | 72 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 419 | B | 72 | 20 | dated 0 / week blocks 20 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 420 | B | 72 | 20 | dated 0 / week blocks 20 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 421 | B | 72 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 422 | B | 72 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 423 | B | 72 | 21 | dated 0 / week blocks 21 | 7 | partial_snapshot; — |
| Лечебное дело | 4 | 424 | B | 72 | 21 | dated 0 / week blocks 21 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 501 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 502 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 503 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 504 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 505 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 506 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 507 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 508 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 509 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 510 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 511 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 512 | A | 76 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 5 | 513 | B | 73 | 19 | dated 0 / week blocks 19 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 514 | B | 73 | 19 | dated 0 / week blocks 19 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 515 | B | 73 | 20 | dated 0 / week blocks 20 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 516 | B | 73 | 20 | dated 0 / week blocks 20 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 517 | B | 73 | 19 | dated 0 / week blocks 19 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 518 | B | 73 | 19 | dated 0 / week blocks 19 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 519 | B | 73 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 520 | B | 73 | 22 | dated 0 / week blocks 22 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 521 | B | 73 | 17 | dated 0 / week blocks 17 | 7 | partial_snapshot; — |
| Лечебное дело | 5 | 522 | B | 73 | 17 | dated 0 / week blocks 17 | 7 | partial_snapshot; — |
| Лечебное дело | 6 | 601 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 602 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 603 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 604 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 605 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 606 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 607 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 608 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 609 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 610 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 611 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 612 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 613 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 614 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 615 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 616 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 617 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Лечебное дело | 6 | 618 | common | 92 | 0 | dated 0 / week blocks 0 | 7 | missing_practice; practice |
| Педиатрия | 1 | 101П | not_applicable | 12 | 9 | rules only | 8 | recovery_snapshot_needs_live_validation; — |
| Педиатрия | 1 | 102П | not_applicable | 12 | 9 | rules only | 8 | recovery_snapshot_needs_live_validation; — |
| Педиатрия | 1 | 103П | not_applicable | 12 | 9 | rules only | 8 | recovery_snapshot_needs_live_validation; — |
| Педиатрия | 1 | 104П | not_applicable | 12 | 6 | rules only | 8 | recovery_snapshot_needs_live_validation; — |
| Педиатрия | 1 | 105П | not_applicable | 12 | 6 | rules only | 8 | recovery_snapshot_needs_live_validation; — |
| Педиатрия | 1 | 106П | not_applicable | 12 | 5 | rules only | 8 | recovery_snapshot_needs_live_validation; — |
| Педиатрия | 1 | 107П | not_applicable | 12 | 5 | rules only | 8 | recovery_snapshot_needs_live_validation; — |
| Педиатрия | 2 | 201П | not_applicable | 10 | 11 | rules only | 7 | recovery_snapshot_needs_live_validation; — |
| Педиатрия | 2 | 202П | not_applicable | 10 | 12 | rules only | 7 | recovery_snapshot_needs_live_validation; — |
| Педиатрия | 2 | 203П | not_applicable | 10 | 12 | rules only | 7 | recovery_snapshot_needs_live_validation; — |
| Клиническая психология | 1 | 101КП | not_applicable | 11 | 14 | rules only | 7 | recovery_snapshot_needs_live_validation; — |
| Клиническая психология | 1 | 102КП | not_applicable | 11 | 14 | rules only | 7 | recovery_snapshot_needs_live_validation; — |
| Клиническая психология | 2 | 201КП | not_applicable | 10 | 11 | rules only | 7 | recovery_snapshot_needs_live_validation; — |
| Клиническая психология | 2 | 202КП | not_applicable | 10 | 11 | rules only | 7 | recovery_snapshot_needs_live_validation; — |

## Critical source integrity findings

### 1. [CRITICAL] 31.05.01 — course(s) 2

Flow B practical source yields only partial coverage.
Missing groups: 217, 218, 219, 220, 221, 222, 225, 226, 227, 228, 229.

**Action:** Re-parse source and prove all groups 217–229 have expected weekly assignments before marking live.

### 2. [CRITICAL] 31.05.01 — course(s) 4

Cached official PDFs for Flow A and B were parsed into weekly-block rotation assignments for every roster group (A: 250 source records/12 groups; B: 248/12). These are week-based assignments without an exact weekday; embedded 2025/2026 date labels conflict with the 2026/2027 heading, and the cached bytes have not been compared with current live URLs.

**Action:** Display as weekly rotation blocks only, never as dated weekday lessons. Complete live-byte/hash revalidation and obtain authoritative confirmation of week-to-date mapping before production-live promotion.

### 3. [CRITICAL] 31.05.01 — course(s) 5

Only the cached Flow B matrix was safely parsed (194 source records/10 groups). Flow A has no parsed records for groups 501–512. Both source documents are linked, but embedded year/date labels are inconsistent with the 2026/2027 heading and live-byte revalidation is pending.
- [Source PDF](https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_a-26-27-na-sajt.pdf)

**Action:** Reacquire and parse current Flow A PDF; retain Flow B as a weekly-block rotation list until live hash comparison and week mapping validation are completed.

### 4. [CRITICAL] 31.05.01 — course(s) 6

The linked course 6 practice PDF is recognised as a weekly matrix but its cached font/text layer is corrupt; the parser correctly rejects its schedule content rather than inventing assignments for groups 601–618.
- [Source PDF](https://education.almazovcentre.ru/wp-content/uploads/2026/09/6k_ld-26-27-na-sajt-1.pdf)

**Action:** Download a clean current PDF or alternative official spreadsheet and parse all 18 groups. Keep the source quarantined until per-group assignments validate.

### 5. [CRITICAL] 31.05.01 — course(s) [4, 5, 6]

Official practical-rotation PDFs are labelled 2026/2027, but week columns 1–13 contain date labels from 2025 and later columns switch to December 2026.
- [Course 4 Flow A](https://education.almazovcentre.ru/wp-content/uploads/2026/10/4k_ld_a-26-27-na-sajt.pdf)
- [Course 4 Flow B](https://education.almazovcentre.ru/wp-content/uploads/2026/09/4k_ld_b-26-27-na-sajt.pdf)
- [Course 5 Flow A](https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_a-26-27-na-sajt.pdf)
- [Course 5 Flow B](https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_b-26-27-na-sajt.pdf)
- [Course 6](https://education.almazovcentre.ru/wp-content/uploads/2026/09/6k_ld-26-27-na-sajt-1.pdf)

**Action:** Matrix week numbers map directly to the official academic-calendar week numbers: column 1's single date 03.09.2025 falls in calendar week 1 (01–05.09.2026); column 2's 07.09.2025–12.09.2025 matches calendar week 2 (07–12.09.2026). Embedded dates remain quarantined. Source PDF byte hashes still require live verification before publishing.

### 6. [HIGH] 31.05.01 — course(s) [4]

The official student hub also publishes a supplementary required simulation-centre schedule for LD course 4; it is absent from the prior source registry.
- [Supplementary simulation-centre sessions](https://education.almazovcentre.ru/wp-content/uploads/2026/10/sim-czentr-4-kurs.pdf)

**Action:** Track this as an additional schedule layer, not as a replacement for ordinary course 4 practices.

## Exact groups with no parsed LD practice assignment

- **Course 1:** 103 (A)
- **Course 2:** 217 (B), 218 (B), 219 (B), 220 (B), 221 (B), 222 (B), 225 (B), 226 (B), 227 (B), 228 (B), 229 (B)
- **Course 5:** 501 (A), 502 (A), 503 (A), 504 (A), 505 (A), 506 (A), 507 (A), 508 (A), 509 (A), 510 (A), 511 (A), 512 (A)
- **Course 6:** 601 (common), 602 (common), 603 (common), 604 (common), 605 (common), 606 (common), 607 (common), 608 (common), 609 (common), 610 (common), 611 (common), 612 (common), 613 (common), 614 (common), 615 (common), 616 (common), 617 (common), 618 (common)

## Safe next action

1. Run the official sync workflow on an internet-connected runner to download current source bytes and compare SHA-256. Cached fixture PDFs for course 4 A/B and course 5 B were parsed locally, but are not yet byte-compared to the currently linked server objects.
2. The local parser now extracts 4A, 4B and 5B matrix sources as first-class weekly rotation blocks. Revalidate their current live bytes and obtain authoritative confirmation for the inconsistent embedded date labels; recover 5A and course 6 from a clean official source.
3. Add explicit normalized event types for seminar, laboratory, clinical review/rotation and practice; test by source document.
4. Re-run strict 100% group × stream coverage checks. Keep `dataState` out of `live-generated` until every expected group is covered by a valid source and all KUG terms pass validation.

## Method and limits

- Current official timetable inventory: official Almazov student hub listed below. Direct link inventory was inspected on 2026-10-10. [Open current hub]({HUB})
- Cross-checked file body for current course 4, 5 and 6 practice PDFs; these use a matrix layout and display date labels from 2025 for weeks 1–13 despite headings for academic year 2026/2027. Links are recorded in the finding above.
- Container networking cannot resolve the official host, so live PDFs could not be downloaded and SHA-256 compared in this run. Parsed weekly-block data comes from cached official PDFs already in the archive; per-source cache hashes and paths are recorded in `data/official-schedules.json`.
- Raw JSON data is also available in `reports/official-coverage-audit-2026-10-10.json`.
