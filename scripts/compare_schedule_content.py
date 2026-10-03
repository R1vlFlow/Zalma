#!/usr/bin/env python3
"""Compare generated schedule content with HEAD, ignoring generated timestamps."""
from pathlib import Path
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
path = root / 'data' / 'official-schedules.json'
if not path.exists():
    raise SystemExit('SCHEDULE COMPARE FAILED: generated index is missing')

current = json.loads(path.read_text(encoding='utf-8'))
current.pop('generatedAt', None)
try:
    previous_raw = subprocess.check_output(
        ['git', 'show', 'HEAD:data/official-schedules.json'],
        cwd=root, text=True, stderr=subprocess.STDOUT
    )
except subprocess.CalledProcessError:
    print('changed')
    raise SystemExit(0)

previous = json.loads(previous_raw)
previous.pop('generatedAt', None)
print('unchanged' if current == previous else 'changed')
