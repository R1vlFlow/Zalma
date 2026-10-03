#!/usr/bin/env python3
"""Run the canonical offline regression suite from data/ci-regression-contract.json."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "ci-regression-contract.json"


def load_tests() -> list[str]:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    tests = data.get("tests")
    if not isinstance(tests, list) or not tests or not all(isinstance(x, str) and x.endswith(".py") for x in tests):
        raise SystemExit("REGRESSION SUITE FAILED: invalid test manifest")
    if len(set(tests)) != len(tests):
        raise SystemExit("REGRESSION SUITE FAILED: duplicate test in manifest")
    missing = [x for x in tests if not (ROOT / x).is_file()]
    if missing:
        raise SystemExit("REGRESSION SUITE FAILED: missing tests: " + ", ".join(missing))
    return tests


def main() -> int:
    tests = load_tests()
    failures: list[str] = []
    print(f"CANONICAL REGRESSION SUITE: {len(tests)} tests")
    for index, rel in enumerate(tests, 1):
        print(f"\n=== [{index}/{len(tests)}] {rel} ===")
        proc = subprocess.run([sys.executable, rel], cwd=ROOT)
        if proc.returncode:
            failures.append(rel)
            print(f"FAILED: {rel} (exit {proc.returncode})")
            break
        print(f"PASS: {rel}")
    if failures:
        print("\nREGRESSION SUITE FAILED")
        print(" - " + "\n - ".join(failures))
        return 1
    print(f"\nCANONICAL REGRESSION SUITE: PASS ({len(tests)}/{len(tests)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
