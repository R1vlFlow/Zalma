# Archived pre-TypeScript contract tests

These contracts inspected the retired monolithic root `index.html` and hard-coded pre-release versions from the old app. The canonical runtime is now the TypeScript SPA under `src/`, built with `public/index.html` into `dist/`. These files are retained only as audit history and are intentionally excluded from current QA. The active regression suite is declared in `data/ci-regression-contract.json` and run by `npm run qa`.
