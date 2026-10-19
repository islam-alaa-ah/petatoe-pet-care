# A16.8 — Localization, permission and responsive UI review

Baseline: A16.6 Service Details Filters Export + A16.6.1 Ranking Separator Fix (overlay).

## Confirmed issues addressed
1. Language-change handler did not refresh execution and yearly comparison tables when `ready` was true. Updated it to redraw all reports; no data queries or accounting changes.
2. Print HTML omitted `dir`; it now chooses `rtl` for Arabic and `ltr` for English.
3. CSV exports included untrusted display fields without protection from spreadsheet formula interpretation. The CSV cell formatter prefixes potentially executable values beginning with `=`, `+`, `-`, `@` (including after leading spaces) with apostrophe, without changing the underlying database values.
4. Mobile ranking and filter CSS adjusted within the existing canonical stylesheet without new override files.

## Permission review
- Main financial reports require `servicesReports` and `salesReports` view permissions via PermissionEngine.
- Operational reports require `installationReports` in addition.
- Detailed export and printing re-check main permissions, and execution records are included only if operational permissions remain granted.
- No permission grants, SQL, RPC or RLS modified. Browser permission tests remain pending.

## Observations / open limitations
- Service catalogue names and car/team names come from source data, not necessarily bilingual; no invented translation was applied.
- Service filter is populated from historically classified sales, not all operational service types. Execution-only services may therefore not be selectable. This needs a scoped follow-up.
- Live Arabic/English, desktop/mobile, print/PDF and role-based verification remain pending.
- No financial or operational aggregation formulas modified.

## Scope / regression risk
Scope: services-reports.js and services-reports.css only. Regression risk low-to-moderate, chiefly CSV spreadsheet compatibility and redraw after language switching.
