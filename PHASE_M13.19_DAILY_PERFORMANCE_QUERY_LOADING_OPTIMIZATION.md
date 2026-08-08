# Phase M13.19 — Daily Performance Query & Loading Optimization

## Root Cause
The daily performance screen forced full customer, follow-up, and quotation module reloads before building a single-day report. Those loaders also rendered unrelated screens and the dashboard. The report then waited for alerts and activity before displaying completion.

## Changes
- Added date-scoped report queries in CustomersService, FollowupsService, and QuotationsService.
- Daily follow-up query includes the selected day plus incomplete overdue follow-ups needed by the report.
- Removed full module reloads from the report loading path.
- The primary report renders before alerts and activity finish loading.
- Added five-minute caching for task definitions, active users, and representatives.
- Added timing diagnostics in the browser console.
- Preserved permission scope through each service's existing representative-scope resolver.
- Preserved offline fallback to already loaded in-memory data if optimized network queries fail.

## Scope Protection
No SQL, RLS, report formulas, permissions, UI design, or business thresholds were changed.

## Version
18.17.0 / build 181700
