# A16.9 — Execution-only service filter coverage

## Baseline
A16.6 + A16.6.1 ranking separator + A16.8 localization/permission/layout fixes (overlaid in order). A16.5.1 value logic is inherited via A16.6.

## Root cause
The service selector in `populate()` used only `rows` with historical service IDs. Confirmed execution services not appearing in classified historical sales could not be selected. Year selector similarly omitted years present only in execution records.

## Fix
- Create year and service options from the union of loaded financial rows and verified confirmed execution rows (`executionReady && executionAllowed()`).
- Keep existing service IDs, customer data, amounts, execution values, and accounting calculations unchanged.
- Refresh options after successful execution load; gracefully restore financial-only options on execution load failure.
- Preserve valid selected options using existing `select()` helper; existing central translation labels remain unchanged.

## Scope
Only `assets/js/services-reports.js`. No SQL, RPC, permission grants, CSS, translation engine, or financial arithmetic changed. No extra sources queried.

## Regression risk / gate
Low-to-moderate: selector options may change following execution load; especially important to verify execution-only services with sales totals remaining zero and execution quantities showing correctly. Test language changes, year/filter reset and roles with and without installationReports access.

## Validation
- Node JavaScript syntax: PASS.
- Static assertions: PASS (union of source records, refresh after load, permission gating).
- Browser/live data and role-specific tests: PENDING. Therefore A16.9 not fully certified yet.
