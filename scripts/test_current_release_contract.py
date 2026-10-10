#!/usr/bin/env python3
"""Release contract for the current TypeScript SPA (not the abandoned root HTML app)."""
from __future__ import annotations
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
checks: list[tuple[str, bool]] = []
def check(name: str, condition: bool) -> None:
    checks.append((name, bool(condition)))

pkg = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
version = json.loads((ROOT / 'version.json').read_text(encoding='utf-8'))
ui_version = (ROOT / 'UI_VERSION.txt').read_text(encoding='utf-8')
engine_text = (ROOT / 'SCHEDULE_ENGINE_VERSION.txt').read_text(encoding='utf-8')
engine_line = engine_text.splitlines()[0] if engine_text.splitlines() else ''
engine = engine_line.split(':', 1)[-1].strip()
sync = (ROOT / '.github/workflows/sync-official-schedules.yml').read_text(encoding='utf-8')
pages = (ROOT / '.github/workflows/pages.yml').read_text(encoding='utf-8')
qa = (ROOT / '.github/workflows/qa.yml').read_text(encoding='utf-8')
copy_public = (ROOT / 'scripts/copy-public.mjs').read_text(encoding='utf-8')
app = (ROOT / 'src/app.ts').read_text(encoding='utf-8')
html = (ROOT / 'public/index.html').read_text(encoding='utf-8')

check('package, version.json and UI version are synchronized',
      pkg.get('version') == version.get('version') == version.get('uiVersion') and version.get('version') in ui_version)
check('schedule engine release metadata is synchronized',
      version.get('engineVersion') == engine and f"SCHEDULE_ENGINE_VERSION: '{engine}'" in sync)
check('canonical app is built from public/index.html and src/app.ts',
      (ROOT / 'public/index.html').exists() and (ROOT / 'src/app.ts').exists() and '"rootDir": "src"' in (ROOT / 'tsconfig.json').read_text(encoding='utf-8') and '"include": ["src/**/*.ts"]' in (ROOT / 'tsconfig.json').read_text(encoding='utf-8'))
check('current SPA exposes schedule cards and next-class homework linking',
      all(token in app for token in ('function renderCardSchedule(', 'function openTaskFromEvent(', 'data-homework-from-event')))
check('official schedule pipeline validates and merges double blocks',
      'merge_consecutive_identical_events' in (ROOT / 'scripts/build_official_schedule.py').read_text(encoding='utf-8') and
      'mergeAutoSplitDoubleSlots' in (ROOT / 'server/pipeline.mjs').read_text(encoding='utf-8'))
check('Pediatrics/Clinical Psychology live sync and strict release gate run before Pages build',
      pages.index('run: python scripts/build_specialist_program_schedules.py') < pages.index('run: python scripts/validate_production_release.py') < pages.index('run: npm run qa') and
      '--use-last-good' not in pages and '--use-last-good' not in sync)
check('Pages RC build requires minification and validated specialist snapshots',
      "REQUIRE_MINIFICATION: '1'" in pages and "REQUIRE_SPECIALIST_SNAPSHOT: '1'" in pages)
check('schedule sync commits data before deploying and does not hide push errors',
      sync.index('git push') < sync.index('actions/upload-pages-artifact@v3') and 'git push || true' not in sync)
check('production build fails closed when required dependencies/data are absent',
      "process.env.REQUIRE_MINIFICATION==='1'" in copy_public and
      "process.env.REQUIRE_SPECIALIST_SNAPSHOT==='1'" in copy_public)
check('QA executes canonical offline regression suite',
      'scripts/run_regression_suite.py' in pkg.get('scripts', {}).get('qa', ''))
check('QA runs release validations as bounded independent gates',
      all(token in pkg.get('scripts', {}).get('qa', '') for token in ('scripts/verify_workflow_contract.py', 'scripts/validate_release.py', 'scripts/validate_schedule_data.py', 'scripts/validate_generated_index.py')) and 'scripts/verify_release.py &&' not in pkg.get('scripts', {}).get('qa', ''))
check('release metadata includes PWA installation controls and support link',
      'data-install-pwa' in html and 'https://t.me/R1vlFlow_GY' in html)
check('release validators accept any numeric RC iteration',
      're.fullmatch' in (ROOT / 'scripts/verify_release.py').read_text(encoding='utf-8') and
      're.fullmatch' in (ROOT / 'scripts/validate_release.py').read_text(encoding='utf-8') and
      "endswith('-rc.1')" not in (ROOT / 'scripts/verify_release.py').read_text(encoding='utf-8'))

failed = [name for name, ok in checks if not ok]
for name, ok in checks:
    print(f'{"PASS" if ok else "FAIL"} — {name}')
print(f'CURRENT RELEASE CONTRACT: {len(checks) - len(failed)}/{len(checks)} passed')
if failed:
    print('FAILED:\n - ' + '\n - '.join(failed))
    sys.exit(1)
