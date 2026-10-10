# RC4 QA report — 2026-10-10

## Results

- `npm run qa`: **PASS** (exit code 0).
- Node tests: **82 passed, 0 failed**.
- Canonical Python regression suite: **12/12**.
- Current-release contract: **13/13**.
- Recovery snapshot contract: **20/20**.
- Deployment contract: **13/13**.
- KUG data contract: **13/13**.
- CI consistency contract: **10/10**.
- Schedule coverage contract: **20/20**.
- RC contract: **18/18**.
- Official coverage audit and recovery UI contracts passed; API smoke test passed.

## Separate release failures

- Live sync (`npm run sync:official`): failed before source discovery due DNS resolution. `reports/live-sync-attempt-latest.json` records the failure; cached files were not replaced.
- Production gate (`python3 scripts/validate_production_release.py`): `BLOCKED_FOR_PRODUCTION`, **230 errors**, checked `2026-10-10T21:01:09.199782+00:00`.
- RC minified build (`npm run build:rc`): failed with `esbuild is required for an RC build` because `esbuild` is absent from the current runtime.
- GitHub Pages deployment: not run; no Git metadata/remote or authenticated deployment interface is attached to the workspace.

Passing offline QA confirms internal contracts; it does not establish complete live official data or production eligibility.
