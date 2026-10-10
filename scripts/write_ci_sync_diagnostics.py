#!/usr/bin/env python3
"""Write a current-run CI sync diagnostic even when the release gate fails.

This report never upgrades source provenance or schedule state; it only records
GitHub Actions stage outcomes and the release gate artifact generated in this run.
"""
from __future__ import annotations
import json, os
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)
now = datetime.now(timezone.utc)

def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None

def parse_ts(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None:
            result = result.replace(tzinfo=timezone.utc)
        return result.astimezone(timezone.utc)
    except ValueError:
        return None

step_names = {
    "sync_kug": "Sync KUG + academic-week calendar",
    "sync_ld": "Sync official LD schedule snapshot",
    "sync_specialist": "Sync Pediatrics + Clinical Psychology",
    "gate": "Strict production release gate",
    "qa": "Full production QA",
    "generated_validation": "Generated output validation",
}
steps = {
    key: {"name": name, "outcome": os.getenv(f"STEP_{key.upper()}_OUTCOME", "unknown")}
    for key, name in step_names.items()
}
failed = [key for key, entry in steps.items() if entry["outcome"] != "success"]

gate = read_json(REPORT_DIR / "production-release-audit.json")
gate_ts = parse_ts((gate or {}).get("checkedAt"))
gate_fresh = bool(gate_ts and abs(now - gate_ts) <= timedelta(hours=1)
                  and steps["gate"]["outcome"] in {"success", "failure"})
status = read_json(ROOT / "data" / "official-sync-status.json") or {}
report = {
    "schemaVersion": 1,
    "checkedAt": now.isoformat(),
    "workflow": {
        "repository": os.getenv("GITHUB_REPOSITORY"),
        "runId": os.getenv("GITHUB_RUN_ID"),
        "runAttempt": os.getenv("GITHUB_RUN_ATTEMPT"),
        "ref": os.getenv("GITHUB_REF"),
        "sha": os.getenv("GITHUB_SHA"),
        "job": os.getenv("GITHUB_JOB"),
    },
    "status": "completed" if not failed else "failed",
    "liveSyncStagesSucceeded": all(steps[k]["outcome"] == "success" for k in ("sync_kug", "sync_ld", "sync_specialist")),
    "productionGateFreshForThisRun": gate_fresh,
    "productionGateStatus": (gate or {}).get("status") if gate_fresh else "not-confirmed-for-this-run",
    "productionGateErrorCount": len((gate or {}).get("errors", [])) if gate_fresh else None,
    "steps": steps,
    "failedOrUnknownSteps": failed,
    "currentDataState": status.get("status"),
    "note": "Diagnostic only. It never changes or promotes schedule provenance. A failed/unknown stage prevents publication; stale gate data is not treated as this run's result.",
}
out = REPORT_DIR / "ci-sync-run-diagnostics.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
