#!/usr/bin/env python3
"""Prevent CI drift between the regression manifest, runner and GitHub workflow."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "data" / "ci-regression-contract.json"
RUNNER_PATH = ROOT / "scripts" / "run_regression_suite.py"
WORKFLOW_PATH = ROOT / ".github" / "workflows" / "sync-official-schedules.yml"

manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
tests = manifest.get("tests", [])
runner = RUNNER_PATH.read_text(encoding="utf-8")
workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

checks: list[tuple[str, bool]] = []
def check(name: str, ok: bool) -> None:
    checks.append((name, bool(ok)))

check("manifest has canonical tests", isinstance(tests, list) and len(tests) == len(set(tests)) and len(tests) > 0)
check("all canonical tests exist", all((ROOT / x).is_file() for x in tests if isinstance(x, str)))
check("runner loads canonical manifest", 'ci-regression-contract.json' in runner and 'json.loads' in runner)
check("runner executes manifest tests", 'subprocess.run([sys.executable, rel]' in runner)
check("workflow invokes canonical runner", 'python scripts/run_regression_suite.py' in workflow)
check("workflow no longer duplicates release test list", not all(x in workflow for x in tests))

# Keep the release gate as one canonical command. This is the exact failure mode
# that previously let the coverage contract and workflow drift apart.
release_block = re.search(
    r"- name: Run release and universal parser regression tests\n(?P<body>.*?)(?=\n      - name:|\Z)",
    workflow,
    flags=re.S,
)
check("release gate exists", release_block is not None)
if release_block:
    body = release_block.group("body")
    check("release gate runs only canonical runner", body.count('python scripts/run_regression_suite.py') == 1 and not any(f'python {x}' in body for x in tests))

failed = [name for name, ok in checks if not ok]
print(f"CI CONSISTENCY CONTRACT: {len(checks)-len(failed)}/{len(checks)} passed")
if failed:
    print("FAILED:")
    for name in failed:
        print(" - " + name)
    raise SystemExit(1)
