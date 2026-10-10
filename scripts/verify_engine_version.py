#!/usr/bin/env python3
"""Fail-fast release contract check without shell heredocs."""
from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[1]
pkg = json.loads((root / 'package.json').read_text(encoding='utf-8'))
actual = str(pkg.get('version', '')).strip()
engine_text = (root / 'SCHEDULE_ENGINE_VERSION.txt').read_text(encoding='utf-8').strip()
engine_line = engine_text.splitlines()[0] if engine_text else ''
engine = engine_line.split(':', 1)[-1].strip() if ':' in engine_line else engine_line
expected = (sys.argv[1] if len(sys.argv) > 1 else engine).strip()
if not expected:
    raise SystemExit('ENGINE VERSION CHECK FAILED: engine version is empty')
workflow = (root / '.github' / 'workflows' / 'sync-official-schedules.yml').read_text(encoding='utf-8')

if engine != expected:
    raise SystemExit(
        f"ENGINE VERSION MISMATCH: SCHEDULE_ENGINE_VERSION.txt={engine!r}, expected={expected!r}; "
        f"app version is independently tracked in package.json={actual!r}."
    )

needle = f"SCHEDULE_ENGINE_VERSION: '{expected}'"
if needle not in workflow:
    raise SystemExit(
        f"ENGINE VERSION MISMATCH: workflow does not declare {needle!r}."
    )

print(f'App version: {actual}; schedule engine: {engine}')
