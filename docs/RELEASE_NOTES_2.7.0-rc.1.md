# Zalma 2.7.0-rc.1 — Master specification RC

## Schedule UI
- Retired the absolute vertical time-axis grid for day/week/work-week views. Lessons render as compact, responsive day cards with time ranges in each card header.
- Preserved day-by-day navigation, KUG date tags, subject colors, homework badges, quick homework creation, personal event drag-and-drop and keyboard-accessible event opening. Personal event duration can be adjusted with explicit ±15-minute controls.
- The weekly card layout includes the selected working-week days; the work-week range is Monday–Saturday.

## Parser / ingestion
- Generalized post-processing to merge consecutive identical lesson slots only when program/course/group/stream/week/date/day/type/subject/room/teacher/source match and a 0–20 minute break separates ordinary lesson-sized slots.
- Merges are marked `mergedConsecutive`; ORG merges retain `orgMerged`. These provenance flags are preserved by frontend and server normalizers so a unified class is not split again.
- Explicit subgroup `half` assignments are a hard merge boundary, preventing intentional `1/2` and `2/2` records from being conflated. Different groups, teachers, rooms, dates, streams, and week identities remain separate.

## QA/release
- Added tests for card-centric schedule rendering, absence of the legacy time-grid renderer, identical-slot merging, mismatched-teacher protection, and merged-event normalization end to end.
- Version: `2.7.0-rc.1`; schedule engine: `4.8.0-rc.1`.
- This remains an RC: Android APK assembly and true visual browser E2E must be verified by GitHub Actions and a real browser/device before general production release.
