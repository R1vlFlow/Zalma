#!/usr/bin/env python3
"""Static + bash syntax validation for every workflow run block.

This intentionally rejects heredocs: YAML indentation makes them fragile and
was the cause of repeated `wanted PY` / `unexpected end of file` failures.
"""
from pathlib import Path
import subprocess, tempfile
import yaml

ROOT = Path(__file__).resolve().parents[1]
WF_DIR = ROOT / '.github' / 'workflows'
files = sorted(list(WF_DIR.glob('*.yml')) + list(WF_DIR.glob('*.yaml')))
if not files:
    raise SystemExit('WORKFLOW SHELL TEST FAILED: no workflows')

for wf in files:
    data = yaml.safe_load(wf.read_text(encoding='utf-8')) or {}
    jobs = data.get('jobs', {})
    if not isinstance(jobs, dict):
        raise SystemExit(f'WORKFLOW SHELL TEST FAILED: {wf} has invalid jobs')
    for job_name, job in jobs.items():
        for idx, step in enumerate(job.get('steps', []) or []):
            if not isinstance(step, dict) or 'run' not in step:
                continue
            script = str(step['run'])
            if '<<' in script:
                raise SystemExit(
                    f'WORKFLOW SHELL TEST FAILED: heredoc found in {wf}:{job_name}:step{idx}'
                )
            with tempfile.NamedTemporaryFile('w', suffix='.sh', encoding='utf-8', delete=False) as f:
                f.write(script)
                name = f.name
            try:
                proc = subprocess.run(['bash', '-n', name], text=True, capture_output=True)
                if proc.returncode:
                    raise SystemExit(
                        f'WORKFLOW SHELL TEST FAILED: bash -n {wf}:{job_name}:step{idx}\n{proc.stderr}'
                    )
            finally:
                Path(name).unlink(missing_ok=True)
print('WORKFLOW SHELL TEST: OK')
