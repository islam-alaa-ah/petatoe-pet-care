# A15.2.6 — Operational Service Productivity

Baseline: A15_2_5_Seven_Reports_Totals.zip, applied on user-provided 2026-10-16 full baseline.

## Root cause / data contract
Existing `InstallationsServiceSafe.operationalReport({})` exposes each appointment's aggregate `executedQuantity`, assignment snapshots (`teamCarId`, `teamId`) and status. It does **not** return service-level names/quantities. Therefore this phase implements verified aggregate service-quantity productivity by car and team, not invented service-type details. The latter remains a separate source-contract task.

## Scope
- Two full-width stacked operational tables: service productivity by car / by team.
- Completed appointments, aggregate executed quantities, average quantity per completed appointment.
- Totals computed across the complete filtered operational result, not visible-page rows. Average = total quantities / completed appointments; undefined denominator displays dash.
- Same year/month/car/team filters and `installationReports` permission gate as existing operations report.
- Four localized entries added to the existing central AR/EN dictionary. Engine unchanged.

## Modified files
- index.html
- assets/js/cars-teams-reports.js
- assets/js/localization-center.js

## Exclusions
No financial logic changes, no DB/SQL/RPC changes, no changes to existing seven total tables, no new permissions, no CSS overrides. Historical service-type breakdown deferred because current operational endpoint does not expose trustworthy per-service lines.

## Checks
- node --check on both modified JS files: PASS.
- DOM identifiers, code references, and dictionary entries: PASS.
- ZIP structural integrity: PASS.
- Live browser operational and language-change tests: PENDING.

## Regression risk
Low-to-moderate; grouped operational quantities inherit pre-existing operationalReport semantics and appointment status classification. Average is based on completed appointments; source quantities are not a financial metric. In live test confirm source completeness, permission gate, and that zero-completion groups show a dash.
