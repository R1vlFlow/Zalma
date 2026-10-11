# Zalma RC5 academic directory hotfix — GitHub integration
Changes backported to the existing GitHub branch: all known 164 groups across three programmes and six course selectors, A/B separation, program/course change bug fixed, direct group navigation, and a recovery-snapshot LIVE mislabel safeguard.
The user-provided integration-ready archive was used as the reference for the hotfix. The existing GitHub main differs from that archive in several other modules. This PR does not claim a full archive replacement.
Local QA of the upgraded archive: npm run qa passed.
Production release is BLOCKED until live official-source sync, source SHA256 verification, roster coverage and minified deployment gates pass. Do not represent recovery data as authoritative.
