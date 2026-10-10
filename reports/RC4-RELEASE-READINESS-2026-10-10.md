# Zalma RC4 — official schedule recovery and release gate

**Checked:** 2026-10-10  
**App:** `2.8.0-rc.4`  
**Decision:** `BLOCKED_FOR_PRODUCTION`

## Work completed in this environment

- Reviewed current official timetable hub and selected PDFs as PDF text and rendered pages: https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/.
- Rebuilt the week ranges for cached practice matrices for LD 4A, 4B and 5B: 250 + 248 + 194 = **692 weekly assignments**. These remain weekly rotations, not calendar-dated classes. The local fixture files are hashed for traceability, but these hashes are not claimed as hashes of the current remote documents.
- Corrected an off-by-one mapping in the weekly matrix recovery and live parser. The official visual grid has a dedicated week 1 column (single-date label `03.09.25`, within calendar week 1: `2026-09-01`–`2026-09-05`) and week 2 label `07.09.25–12.09.25`, matching calendar week 2. Matrix weeks now map directly: `calendarWeekNumber = matrixWeekNumber`; embedded old-year labels remain flagged and are never treated as current dates.
- Added strict checks so the release gate verifies that the matrix-to-calendar offset and the actual start/end range match the official week map.
- Regenerated 1,544 **recovery-only** placements from existing curated rules for Pediatrics and Clinical Psychology courses 1–2. These events carry non-live provenance and cannot pass the production gate.
- Fixed parser behavior to recalculate detected group-column positions per page, and added a regression fixture for changed group header layout.
- Full `npm run qa` passed after the mapping fix. Recovery integrity test passed: 22 sequential academic weeks, 692 weekly blocks, 1,544 specialty recovery events.
- Normal `npm run build` passed and fingerprints the build; `minified=false` is explicit.

## Findings from official PDF review

| Source | Officially visible | Current local recovery | Outcome |
|---|---|---|---|
| LD 2B practice | 5-page daily timetable, groups 217–229 | 12 events, only two groups represented | **Incomplete; quarantined from release** |
| LD 4A practice | matrix for groups 401–412 | 250 weekly assignments | Recovery only; remote PDF hash unverified |
| LD 4B practice | matrix for groups 413–424 | 248 weekly assignments | Recovery only; remote PDF hash unverified |
| LD 5A practice | matrix for groups 501–512, 15 week columns | 0 extracted assignments | **Unparsed; release blocker** |
| LD 5B practice | matrix for groups 513–522 | 194 weekly assignments | Recovery only; remote PDF hash unverified |
| LD 6 practice | 2-page matrix, groups 601–618, 16 week columns | 0 extracted assignments from local fixture | **Quarantined; release blocker** |
| Academic week calendar | 22 week ranges | 22 reviewed ranges | Byte hash unavailable; a published `31.12.2027` holiday label is retained as an anomaly |
| Pediatrics / Clinical Psychology | official links for courses 1–2 on hub | 1,544 local recovery placements | Rules expanded, but underlying PDFs not byte-hash verified |
| KUG | 10 official published program/course links | 10 curated KUG entries | KUG PDF contents/raw hashes not live-verified; published coverage only, not all 17 theoretical program/course slots |

## Network and production limitations

- Raw downloads of official PDFs could not be completed from this runtime because name resolution for `education.almazovcentre.ru` fails. Reading a PDF through a web-rendered page is useful evidence for the visible document contents but is **not** an origin-byte download and cannot produce the current remote SHA-256.
- `npm run sync:official` could not complete at the official-source network step. It must be rerun on a network-enabled runner.
- `npm run build:rc` failed because `esbuild` is not installed in this runtime. The ordinary build works but writes `minified=false`; it is not an acceptable production artifact. The release workflow must install dependencies and repeat the minified build.
- `python3 scripts/validate_production_release.py` returned **BLOCKED_FOR_PRODUCTION with 230 validation diagnostics**. The count includes multiple source-provenance/coverage failures per source; it is not 230 separate code defects. Examples include missing remote SHA-256/content size/checkedAt, incomplete LD 2B/5A/6 practice, non-live specialty snapshots and unverified KUG/week calendar sources.
- No deployment or push to GitHub was performed from this runtime.

## Release decision

Do not publish this local recovery snapshot as complete or live. The source IDs in `reports/official-pdf-review-2026-10-10.json` preserve official URLs, page counts, local fixture paths, and local fixture hashes separately from remote hashes. Production requires a successful networked sync, remote content SHA-256 and byte counts for every source, full roster/group coverage, verified calendar alignment, a live specialist snapshot, a minified artifact, and a zero-error release gate.
