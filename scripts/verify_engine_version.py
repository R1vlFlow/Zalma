#!/usr/bin/env python3
"""Fail-fast release contract check without shell heredocs."""
from pathlib import Path
import json
import sys

root = Path(__file__).resolve().parents[1]
pkg = json.loads((root / 'package.json').read_text(encoding='utf-8'))
actual = str(pkg.get('version', '')).strip()
expected = (sys.argv[1] if len(sys.argv) > 1 else actual).strip()
if not expected:
    raise SystemExit('ENGINE VERSION CHECK FAILED: package.json version is empty')
engine = (root / 'SCHEDULE_ENGINE_VERSION.txt').read_text(encoding='utf-8').strip()
workflow = (root / '.github' / 'workflows' / 'sync-official-schedules.yml').read_text(encoding='utf-8')

if actual != expected or engine != actual:
    raise SystemExit(
        f"ENGINE VERSION MISMATCH: package.json={actual!r}, expected={expected!r}, "
        f"SCHEDULE_ENGINE_VERSION.txt={engine!r}. The repository contains mixed releases."
    )

needle = f"SCHEDULE_ENGINE_VERSION: '{expected}'"
if needle not in workflow:
    raise SystemExit(
        f"ENGINE VERSION MISMATCH: workflow does not declare {needle!r}."
    )

print(f'Engine version: {actual}')
