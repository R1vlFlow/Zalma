# Independent QA recheck — 2026-10-10

Release reviewed: `2.8.0-rc.2` (UI), schedule engine `4.9.0-rc.1`.

## Defects found and corrected

1. **The canonical regression suite was stale and was not called by the main QA command.** Its old entries asserted retired monolithic HTML and a pre-release version from the previous architecture. Replaced it with 10 regressions for the current TypeScript SPA, parser fixtures, source mismatch handling, matrix schedules, and specialist source discovery. The five retired contracts remain under `tests/legacy-contracts/` for reference and are not part of current acceptance.
2. **The RC contract hardcoded the previous RC number.** Version, APK/release link and validators now follow the current semantic RC version. `2.8.0-rc.2` is synchronized through `package.json`, `version.json`, `UI_VERSION.txt`, docs and workflow defaults.
3. **Official schedule sync could hide a failed `git push`.** Removed `|| true`; sync will now fail before deploying when generated data cannot be persisted. The workflow contract explicitly checks this.
4. **The aggregate release checker duplicated several gates inside the long shell chain.** The main QA command now runs the workflow, release, schedule-data and generated-index validations as separate gates after the other regression checks.
5. **Server smoke-test teardown was racy and could keep the runner alive.** The exit handler is registered before SIGTERM, termination is bounded, SIGKILL is used as a last resort, and a successful test exits only after teardown.
6. **Source-specific regressions were verified.** Flow is inferred from document content when filenames disagree; adjacent ORG / equivalent double slots merge through parser and API normalization; different groups/teachers remain separate; explicit `1/2` and `2/2` markers are preserved.

## QA results

- `npm run qa`: exit code `0` in the isolated completed run.
- Node tests: `75/75`.
- Current canonical regression suite: `10/10`.
- Specialist source regression suite: `9/9`.
- RC contract: `18/18` (current release-specific gate; the current-release contract is `13/13`).
- Deployment contract: `13/13`.
- KUG data contract: `12/12`.
- CI consistency: `7/7`.
- Schedule coverage: `20/20`.
- Phase 3 parser regressions: pass.
- HTTP acceptance: pass.
- Release validation, generated-index validation, JS syntax, theme contrast and server smoke: pass.

## Explicit limitations — do not infer success beyond these checks

- The local output in `dist/version.json` says `minified: false`, because installing `esbuild` was not possible in this environment. GitHub Pages / RC workflows require `REQUIRE_MINIFICATION=1` and should fail closed if the minifier is not installed there.
- `data/program-schedules.json` is a live-generated ingestion artifact and is not fabricated or bundled as dummy data. The official sync workflow creates it before validating and deploying specialist snapshots; the local developer build logs a warning if it is absent.
- The Almazov Centre page currently has a mislabeled link for the second-year Pediatrics lecture PDF: the link label says Pediatrics, while the PDF identity says `31.05.01 Лечебное дело`, Flow A. The parser quarantines this mismatch rather than leaking the wrong faculty's classes into Pediatrics. Full Pediatrics lecture completeness remains dependent on the source owner correcting or replacing that link.
- Full visual E2E on a real mobile browser was not completed in this environment. Automated layout contracts, HTTP and parser tests are not a substitute for that manual device check.
- GitHub Pages is static hosting and does not itself run the optional Node backend.
