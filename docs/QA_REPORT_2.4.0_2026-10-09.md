# QA report — Almazov Schedule Hub 2.4.0

- Version: `2.4.0`
- UI version: `2.2.0`
- Production build ID: `90bfa026bc22b4d4`
- Final command: `npm run qa`

## Results

- Strict TypeScript typecheck: PASS
- Project lint gate: PASS
- Production build and `dist` validation: PASS
- Node test suite: 61/61 PASS
- Browser-cache invalidation contract: PASS
- GitHub Pages/workflow deployment contract: 8/8 PASS
- KUG schema/data contract: 12/12 PASS
- CI consistency contract: 7/7 PASS
- Double-lesson contract across calendar views: PASS
- Official schedule coverage contract: 20/20 PASS
- Official parser regression contract: PASS (4,155 events, 6 source descriptors, 9 source-linked assessment periods)
- Theme contrast gate: PASS (primary text combinations >= 4.5:1)
- HTTP acceptance: PASS (schedule 4/6, UTC CRUD, validation status, support ownership)
- Server smoke: PASS (health 200, invalid schedule 400, index 200)

## Feature-level tests

Eight additional tests cover:
- central persistence of profile/theme/subject colors/homework/materials;
- PDF attachment persistence in the personal browser store;
- Monday–Saturday workweek and weekday labels for the selected date;
- all three schedule modes and date-ranged KUG overlays;
- homework deadline, priority/status, link and attachment form contracts;
- profile nickname, avatar upload/crop, group, timezone and accent controls;
- shared normalized subject-color keys in calendar/homework/materials;
- materials search, grouping, tags, usefulness rating and responsive contracts.

## Explicit limitations

- A headless Chromium/Playwright visual run could not be completed in this execution environment: navigation to both the local HTTP test server and `file://` URLs was rejected with `ERR_BLOCKED_BY_ADMINISTRATOR`. Therefore no claim is made that visual browser E2E passed. Responsive CSS/contracts and static build validations did pass.
- Profile, avatar, subject colors, homework and user-added materials use `localStorage` and are specific to the current browser/device. Cross-device synchronization requires authenticated backend storage.
- For KUG tracks without a direct source PDF URL, the UI deliberately labels periods as a baseline that must be checked against the latest institute document rather than claiming per-period official confirmation.
