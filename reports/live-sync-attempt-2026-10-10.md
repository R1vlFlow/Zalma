# Live sync attempt and strict release audit — 2026-10-10

**Result: `BLOCKED_FOR_PRODUCTION`**

## Actual live-sync command

Command executed in this environment: `npm run sync:official`.

- Timestamp: `2026-10-10T21:01:08.401208+00:00`
- Stage: `official-hub-discovery`
- Result: `failed` — DNS resolution for `education.almazovcentre.ru` failed before the official hub could be retrieved.
- Original PDF bytes downloaded in this attempt: **no**.
- Raw official PDF SHA-256 digests verified: **0**.
- Existing cached schedule files replaced: **no**.
- Publication allowed: **no**.

The sync script now catches the error, writes `reports/live-sync-attempt-latest.json`, updates `data/official-sync-status.json` to `local-recovery`, and preserves existing schedule payload files. It does not relabel recovery data as live data.

## Official PDFs reviewed through web-rendered source pages

The browser-accessible official pages expose the current documents, but this runtime cannot retrieve the original bytes. Reviewing rendered PDF pages is useful for source identity and table structure; it is **not** equivalent to a live binary sync and does not provide verifiable SHA-256 values.

| Document | Current official URL | Rendered pages | Confirmed structure | Accepted locally |
|---|---|---:|---|---:|
| Year 2, Flow B practice | <https://education.almazovcentre.ru/wp-content/uploads/2026/09/2k_ld_b-26-27-na-sajt.pdf> | 5 | Groups 217–229 (13 groups), weekday/time grid | 12 records; incomplete |
| Year 5, Flow A practice | <https://education.almazovcentre.ru/wp-content/uploads/2026/09/5k_ld_a-26-27-na-sajt.pdf> | 1 | Groups 501–512 (12 groups), 15 week columns | 0 accepted records |
| Year 6 practice | <https://education.almazovcentre.ru/wp-content/uploads/2026/09/6k_ld-26-27-na-sajt-1.pdf> | 2 | Groups 601–618 (18 groups), 16 week columns | 0 accepted records; corrupt local fixture quarantined |
| Academic week calendar | <https://education.almazovcentre.ru/wp-content/uploads/2026/08/grafik-uchebnyh-nedel-2026-2027-uch.-god-1.pdf> | 1 | 22 numbered week ranges | Reviewed via rendered text; raw bytes unverified |

The official student hub currently exposes ten KUG course PDFs: лечебное дело 1–6, педиатрия 1–2, клиническая психология 1–2. All ten URLs are already in the source manifest; none received raw-byte verification during this attempt. Hub: <https://education.almazovcentre.ru/about_institute/programm/specialist_programme/student/>.

## Week-number integrity

The corrected rule is direct week identity: `matrixWeekNumber == calendarWeekNumber` (`weekCalendarOffset = 0`). The 2025 strings embedded in matrix headers are kept as source anomalies and are not used as actual event dates. Week blocks remain undated and are shown separately from daily events unless a valid published day is known.

## QA and release checks

- `npm run qa`: **PASS** — 82/82 Node tests; canonical Python regressions 12/12; release, deployment, KUG, cache, coverage and generated-output contracts passed.
- `python3 scripts/validate_production_release.py`: **FAIL-CLOSED**, status `BLOCKED_FOR_PRODUCTION`, **230 errors** at `2026-10-10T21:01:09.199782+00:00`.
- `npm run build:rc`: **failed** because package `esbuild` is not installed in the current runtime; the non-minified build is not a substitute for the required RC build.
- Git deployment: not performed. This workspace has no `.git` repository, configured remote, or GitHub CLI/authentication; no push or Pages deployment was possible.

## Decision

Do not publish. The zero-error production gate remains unachieved. To close it, run `.github/workflows/sync-official-schedules.yml` from the connected repository/network runner. That run must download the original PDF bytes, record and validate SHA-256/byte counts/freshness/identity, rebuild complete group/stream coverage and specialist snapshots, pass `validate_production_release.py` with zero errors, and finish minified QA before Pages deployment. Do not manually waive provenance or coverage failures.
