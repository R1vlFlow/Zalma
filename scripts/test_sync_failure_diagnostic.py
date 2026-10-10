#!/usr/bin/env python3
"""Exercise fail-closed network failure logging without touching real project state."""
from __future__ import annotations
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import sync_kug_and_calendar as sync  # noqa: E402


def main() -> int:
    old_root = sync.ROOT
    with tempfile.TemporaryDirectory(prefix="zalma-sync-failure-test-") as tmp:
        sync.ROOT = Path(tmp)
        status_path = sync.ROOT / "data" / "official-sync-status.json"
        status_path.parent.mkdir(parents=True)
        status_path.write_text(json.dumps({"status": "local-recovery", "snapshot": "keep-me"}), encoding="utf-8")
        # Simulate the real exception raised by the official source-page request.
        error = RuntimeError(
            "HTTPSConnectionPool(host='education.almazovcentre.ru', port=443): "
            "NameResolutionError: Failed to resolve '/about_institute/programm/specialist_programme/student/'"
        )
        diagnostic = sync.write_sync_failure_diagnostic(error)
        status = json.loads(status_path.read_text(encoding="utf-8"))
        report = json.loads((sync.ROOT / "reports" / "live-sync-attempt-latest.json").read_text(encoding="utf-8"))
        assert diagnostic["status"] == "failed"
        assert diagnostic["stage"] == "official-hub-discovery"
        assert diagnostic["networkFailure"] is True
        assert diagnostic["rawPdfBytesDownloaded"] is False
        assert diagnostic["officialPdfSha256Verified"] == 0
        assert diagnostic["snapshotFilesReplaced"] is False
        assert diagnostic["publicationAllowed"] is False
        assert status["status"] == "local-recovery"
        assert status["snapshot"] == "keep-me"
        assert status["lastLiveSyncAttempt"]["gateStatusAfterAttempt"] == "BLOCKED_FOR_PRODUCTION"
        assert report == diagnostic
        print("PASS — DNS failure writes structured diagnostics, preserves recovery state, and denies publication")
    sync.ROOT = old_root
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
