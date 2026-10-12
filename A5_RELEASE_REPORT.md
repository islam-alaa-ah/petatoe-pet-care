# A5 — Sales reporting comparison and payment category

## Root cause
- Separate raw payment labels represented one confirmed online website method.
- Unspecified payment bucket rendered even when sum was zero.
- Previous-period report shifted by month rather than comparing whole years.
- Chart legend and axis typography was too small.

## Impact / Scope
- Frontend grouping and display only; original rows and SQL untouched.
- Comparison years uses selected year (or current year for all-years filter) vs preceding year; month selector deliberately ignored in these three comparative reports; all other filters apply symmetrically.
- Quarters: Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec; no double counting; all totals derive from one normalized row set.
- Unknown methods with nonzero value remain visible, to avoid hiding financial exceptions.

## Files modified
- index.html
- assets/js/sales-reports.js
- assets/css/sales-reports.css (canonical owner, merged rules)

## Regression risk
- Low for added reports; Medium for confirmed website/electronic payment categorization; live data parity and permissions must still be validated in production.

## Deployment
- Overlay modified files using original paths. No SQL migration. Clear stale cached frontend assets if necessary; refresh report data.
