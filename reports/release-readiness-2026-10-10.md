# Zalma RC4 release readiness — 2026-10-10

**Current verdict: BLOCKED_FOR_PRODUCTION. This is not a final release and has not been deployed.**

## Verified in this environment

- Full `npm run qa` passed: 82/82 Node tests, 12/12 canonical Python regression tests, and all named deployment/KUG/cache/parser/coverage/HTTP contracts.
- Official student-hub page and rendered views of the current target PDFs were reviewed via the browser web reader.
- The matrix-week mapping bug was corrected: week N maps to official calendar week N, not N+1.
- Failed live sync now emits structured diagnostics and preserves the existing local-recovery snapshot without promoting it.

## Not verified / blocking

1. `npm run sync:official` failed at DNS resolution before PDF bytes were downloaded.
2. Raw official PDF SHA-256 and byte counts verified: 0.
3. Local practice coverage remains incomplete: LD 2/B only 12 accepted records across a 13-group source; LD 5/A zero accepted rotation rows for groups 501–512; LD 6 zero accepted practice rows for groups 601–618 because the cached binary fixture is corrupt.
4. Specialist datasets for Pediatrics and Clinical Psychology are recovery-only, not live verified.
5. Strict production gate: 230 errors.
6. `npm run build:rc` fails because `esbuild` is missing from this runtime; only the non-minified build can be run here.
7. No Git repository, configured remote, GitHub CLI, or connected deployment API is available in this workspace; push and GitHub Pages deployment were not executed.

## Release rule

Only promote after the networked GitHub runner downloads the current official source bytes, validates the complete roster/streams and week mapping, rebuilds current KUG and specialty datasets, verifies SHA-256 and timestamps for each source, produces `production-release-audit.json` with exactly zero errors, passes minified QA, and then completes Pages deployment. A cached snapshot or browser-rendered PDF view is not a substitute for live byte verification.

Latest attempt details are in `reports/live-sync-attempt-latest.json` and `reports/live-sync-attempt-2026-10-10.md`.
