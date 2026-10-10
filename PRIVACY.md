# Almazov Student — privacy notes (beta)

The beta is designed as a local-first application. Profile data, tasks, notes, schedule imports, subject colors and theme settings are stored on the user's device in browser storage unless the user explicitly exports or shares them.

Do not enter passwords, medical records, passport data, student IDs, or other sensitive information into the beta.

Imported schedule files are processed in the browser. External CDN resources used by the beta may receive normal network metadata required to fetch those resources.

The project is independent from NMITs named after V.A. Almazov. The beta disclaimer should remain visible to new users.

This document is a technical beta notice, not legal advice or a complete jurisdiction-specific privacy policy.


## Phase 3 RC diagnostics and analytics

The app records a bounded local diagnostic queue (up to 30 sanitized client errors and 200 low-cardinality UI event names) in this browser's local storage. It does not send these records to a third party unless an owner-configured HTTPS error endpoint or approved Google Analytics/Yandex Metrika ID is added to `public/runtime-config.js`. UI telemetry records stable navigation/action identifiers only; it does not send form values, homework text, file names or profile names. Configure applicable consent and retention before enabling remote analytics in production.
