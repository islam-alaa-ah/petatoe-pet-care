# A15.2.7 — Operational workload by vehicle/team

Baseline: A15_2_6_Service_Productivity.zip, retaining both existing service productivity reports.

## Root cause / Scope
Operational reporting lacked an active-day workload metric. Added two full-width stacked reports for appointments per recorded active day by vehicle and team, using only `InstallationsServiceSafe.operationalReport` already filtered in the screen.

## Financial boundary
No sales-per-appointment value is introduced: no verified invoice→appointment join exists in these two report datasets. Dividing historical revenue by operational appointment counts could give an incorrect result. A validated link and aligned date scope are needed first.

## Logic
Each matching appointment counts once in its resource group. Active days = distinct valid calendar dates per group. Overall active days = union of valid dates across groups, NOT sum of group-days. Rate = total appointments / active days; completion percentage = completed / total. A missing date does not create an active day. Zero valid days shows a dash, not an invented rate.

## Localization and compatibility
Four new Arabic and English keys in the original central dictionary. No translation engine changes or CSS overrides. All current filters and permission gate are reused. Existing financial calculations and two service productivity reports are unchanged.

## Impact / Scope / Regression risk
Files: index.html, assets/js/cars-teams-reports.js, assets/js/localization-center.js. No SQL/RPC or permissions changes. Low-to-medium regression risk in operational grouping and date validity; confirm in browser.

## Checks
JS syntax PASS; element IDs, localization key coverage and preservation of prior reports PASS. Browser/live verification PENDING.
