#!/usr/bin/env python3
"""Fail fast if a stale/duplicate schedule-sync workflow is present."""
from pathlib import Path
import re, sys

root = Path(__file__).resolve().parents[1]
wfdir = root / '.github' / 'workflows'
files = sorted(list(wfdir.glob('*.yml')) + list(wfdir.glob('*.yaml')))

if not files:
    raise SystemExit('WORKFLOW CONTRACT FAILED: no GitHub Actions workflows found')

stale = []
for p in files:
    text = p.read_text(encoding='utf-8')
    if re.search(r'assert\s+d\.get\(["\']schemaVersion["\']\)\s*==\s*5', text):
        stale.append(f'{p}: stale schemaVersion==5 validator')
    if 'Sync official Almazov schedules' in text and p.name != 'sync-official-schedules.yml':
        stale.append(f'{p}: duplicate official schedule workflow')

if stale:
    raise SystemExit('WORKFLOW CONTRACT FAILED:\n - ' + '\n - '.join(stale))

p = wfdir / 'sync-official-schedules.yml'
if not p.exists():
    raise SystemExit('WORKFLOW CONTRACT FAILED: canonical sync-official-schedules.yml missing')

text = p.read_text(encoding='utf-8')
required = [
    "SCHEDULE_ENGINE_VERSION: '4.3.0-pre6'",
    'SCHEDULE_ENGINE_VERSION.txt',
    'scripts/test_schedule_parser.py',
    'scripts/build_official_schedule.py',
    'scripts/validate_generated_index.py',
    'scripts/validate_schedule_data.py',
    'scripts/test_workflow_shell.py',
    'scripts/verify_engine_version.py',
    'scripts/compare_schedule_content.py',
    'scripts/test_ci_consistency.py',
    'scripts/run_regression_suite.py',
]
for needle in required:
    if needle not in text:
        raise SystemExit(f'WORKFLOW CONTRACT FAILED: missing {needle!r}')
for required_file in ('data/ci-regression-contract.json', 'scripts/run_regression_suite.py', 'scripts/test_ci_consistency.py'):
    if not (root / required_file).exists():
        raise SystemExit(f'WORKFLOW CONTRACT FAILED: missing repository file {required_file!r}')

if "SCHEDULE_ENGINE_VERSION: '4.1.1'" in text or "expected='4.1.1'" in text:
    raise SystemExit('WORKFLOW CONTRACT FAILED: stale engine version 4.1.1 expectation still present')

if '<<' in text:
    raise SystemExit('WORKFLOW CONTRACT FAILED: heredoc syntax is forbidden in workflows; use repository scripts instead')

if 'schemaVersion' in text and '== 5' in text:
    raise SystemExit('WORKFLOW CONTRACT FAILED: legacy schema 5 validation still present')

print('WORKFLOW CONTRACT: OK')
