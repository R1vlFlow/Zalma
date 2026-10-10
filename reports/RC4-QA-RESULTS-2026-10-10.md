# RC4 QA results — 2026-10-10

## Executed checks

- `npm run qa`: **PASS** (exit 0) after the week-matrix alignment change.
- `npm run recover:offline-safe`: **PASS**.
- `scripts/test_offline_recovery_integrity.py`: **PASS** — 22 official week ranges reviewed; 692 matrix weekly assignments; 1,544 local specialty recovery events; no inferred weekdays/dates.
- `npm run build`: **PASS**, build id `53e98b06a03e53f8`; `minified=false`.
- `npm run build:rc`: **FAIL in this execution environment** because package `esbuild` is not installed in the local runtime. The CI install step runs `npm install`; this minified RC build still must run on the networked CI runner before deployment.
- `npm run sync:official`: **not completed** because official-origin DNS/download access is unavailable here; fresh bytes for the current official PDFs could not be hashed.
- `python3 scripts/validate_production_release.py`: **BLOCKED_FOR_PRODUCTION**, 230 validation diagnostics at the latest run. This is the intentional fail-closed result, not a passing release gate.

## Data state

- Local timetable snapshot remains `local-recovery-snapshot`; never describe it as live or complete.
- Restored weekly rotations: 4A 250, 4B 248, 5B 194 (692 total). All are undated matrix blocks with `matrixWeekNumber` preserved and `calendarWeekNumber = matrixWeekNumber` after a correction to the previous off-by-one assumption.
- 2B official PDF is visibly 5 pages, with group columns 217–229; local extraction remains only 12 events and is incomplete.
- 5A official PDF contains groups 501–512 and 15 weekly columns; zero local assignments have been parsed.
- 6th-course official PDF contains groups 601–618 and 16 weekly columns; its local fixture text layer was rejected, so zero local practice assignments are accepted.
- Pediatrics and Clinical Psychology local recovery snapshot contains 1,544 placements for courses 1–2; source raw bytes/SHA-256 remain unverified.
- KUG sources are registered for the 10 course/program combinations currently published on the official hub, but their remote file hashes and contents have not been byte-verified in this execution.

## Required before release

Run the official sync on a network-enabled runner; compare and save source byte counts, SHA-256 and checkedAt for every current PDF; resolve source date/header anomalies; ensure direct practice assignments across all expected groups/streams; produce a fresh live specialist snapshot; run minified `npm run qa`; and require a zero-error production gate before publishing. No production deployment was performed from this environment.
