# A15 Navigation Registry Repair

## Cause
In the newer app.js baseline (A17.2.2.1), `carsTeamsReports` was absent from the `views` registry while A15's HTML nav button and view container were present. Q7 confirmed unknown_view and permission allowed.

## Fix
Restored the four native A15 integration points present in the original A15.2.1 source: views registry, pageMeta, switchView activation hook, and active-language re-render hook. Reused existing `carsTeamsReports.title/subtitle` translation keys. No permission bypass, financial or query changes.

## Source and testing
Based on the newest package in the session containing `assets/js/app.js` (A17.2.2.1). Syntax checked with `node --check`. Dynamic browser test required. Merge, do not replace, if production app.js has changed since this baseline.
