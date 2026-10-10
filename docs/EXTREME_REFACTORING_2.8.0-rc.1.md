# Extreme refactoring — 2.8.0-rc.1

## Confirmed code changes

- Added a dedicated discovery/ingestion pipeline for Pediatrics (`31.05.02`) and Clinical Psychology (`37.05.01`) from the official Almazov student page. It reads course, subject type and flow from document content before trusting link labels. Course discovery supports 1–6; unpublished courses remain explicitly unpublished rather than receiving invented events.
- The pipeline validates degree/program/year headers, quarantines mismatched sources, preserves last-known-good data per failed source, and writes versioned `data/program-schedules.json` which is compiled into program/course snapshots for static hosting.
- Image preview runs OCR for source identity verification. Official-source CI installs `tesseract-ocr` and Russian language data. OCR failure is an explicit source error, never a reason to publish unverified content.
- Adjacent identical slots are merged into continuous blocks when program/course/group/stream/date/type/subject/teacher/room/source match and time adjacency is plausible. Explicit `1/2` and `2/2` parts remain separate.
- Generated specialist snapshots take priority over memory/Redis/disk caches; stale Redis envelopes with an older pipeline version are rejected.
- Build-version changes invalidate only schedule/parser caches, preserving profile, subject colours, homework and user materials. Static schedule requests are build-versioned and use `no-store`; the Node backend sends `Cache-Control: no-cache, no-store, must-revalidate` for JSON, manifest and HTML.
- The schedule remains card-centric; the legacy vertical time grid was removed from the active rendering path.

## Local QA limitations

The repository container cannot retrieve the current official page directly in this execution environment. Parser discovery and identity handling are covered by deterministic fixtures; the official live-source refresh runs through GitHub Actions. Release workflows fail closed if the generated program schedule bundle or minification is missing.

One official link currently labelled as a second-year Pediatrics lecture points to a document whose internal heading identifies it as General Medicine, Stream A. The ingestion pipeline quarantines that mismatch. A complete Pediatrics lecture snapshot for that year depends on correction of the source link or publication of the correct official document; the system does not relabel General Medicine events as Pediatrics.
