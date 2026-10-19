# A17.2.2.2 — Customer Retention Date-Range Accuracy

## Scope
- Date ranges shown above retention chart, fully synchronized with year/month/comparison filters.
- Uses ISO date-inclusive filtering per customer, rather than bare YYYY-MM month membership.
- Previous mode: immediately preceding equal-duration range; YoY mode: corresponding prior-year dates.
- Live current month/year: counts stop at user's current local business date and retention percentage remains unavailable (provisional counts only).
- Completed periods: retention = intersection of distinct customers / distinct reference customers; zero base -> unavailable.
- Adds current-only and reference-only customer metrics to expandable detail table (not labeled new customer to company).
- Keeps segment drilldown, daily follow-up actions, permissions, existing RPC and source and centralized localization intact.

## Modified runtime files
- index.html
- assets/js/advanced-analytics-customers.js
- assets/js/localization-center.js
- assets/css/advanced-analytics.css

## Verification
- node --check: PASS
- Date-range tests: PASS (completed month, year, crossover Dec/Jan and YoY).
- Data reconciliation/browser tests: PENDING; requires actual authenticated client.

## Caution
- Previous-period comparison uses exactly the same day count, so a completed 31-day month following a 30-day month uses a 31-day reference window that can include the last day of the month before that. Both actual dates are explicitly shown.
- No changes to sales figures, finance functions, database policies, permissions, or follow-up records.
