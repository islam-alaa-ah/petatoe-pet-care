# P5.13.8.54 — Appointment Overdue Filter & Time-Aware Predicate

## Scope
- Add `متأخر / Overdue` to the appointment status filter.
- Use one canonical overdue predicate for both the Requests KPI and the filter.
- Treat an appointment as overdue when its scheduled date/time has passed and its workflow is not closed (`مكتمل` / `ملغي`).
- Preserve legacy rows with no exact scheduled time: they become overdue only after the scheduled day fully passes.
- No database, scheduling, execution, collection, invoice, permissions, or CSS changes.

## Root Cause
The Requests KPI had its own date-only overdue calculation, while `installationRequestStatusFilter` only compared persisted `row.status`. Since overdue is a derived temporal state and not a stored workflow status, the filter could never select it. The KPI also ignored the scheduled clock time for same-day appointments.

## Canonical Owner
`assets/js/installations-module.js`
- `installationScheduledDeadline(row)`
- `isInstallationRequestOverdue(row, nowMs)`

Both the KPI and filter call the same predicate.

## Regression checks
- Past same-day exact time -> overdue: PASS
- Future same-day exact time -> not overdue: PASS
- Previous-day legacy row without exact time -> overdue: PASS
- Same-day legacy row without exact time -> not prematurely overdue: PASS
- Completed appointment excluded: PASS
- Cancelled appointment excluded: PASS
- Past in-progress appointment remains overdue until closed, preserving prior KPI semantics: PASS
- JavaScript syntax: PASS
- Localization Lockdown: PASS
- Runtime Regression: PASS
- Appointment Financials & Multi-Schedule: PASS
- Same-Day Execution Group: PASS
- Maintenance/Cache Certification: 7/7 PASS

## SQL Required
No.

## Release
- Version: 18.55.72
- Build: 185572
