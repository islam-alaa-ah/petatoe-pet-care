# A7 — Sales comparison charts

STATUS: LOCAL PASS / LIVE VISUAL AND FINANCIAL VERIFICATION PENDING

Root cause: A6 rendered KPI cards instead of the requested charts.
Impact: Comparison dashboards were not graphical.
Scope: assets/js/sales-reports.js, assets/css/sales-reports.css only.
Changes: replaced summary cards with paired bar SVG charts above unchanged year/quarter/month tables. Year selection and non-date filters are preserved.
Regression risk: low for finance; medium for browser visual output. No SQL, RLS, source data, permissions, or other screens modified.
CSS ownership: changed only canonical sales-reports.css; replaced A6 KPI rules instead of stacking overrides.
Checks: JS syntax + A7 chart contract tests + A5 tests. A6 tests deliberately superseded (they require deleted KPI cards).
Live data and browser screenshot not certified.
