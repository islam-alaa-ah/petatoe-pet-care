# A15.2.5 — Table total rows

Baseline: A15.2.4 Operational Trends & Details.

Scope: Seven requested reports only. Each table uses a persistent tfoot after tbody and sums all records matching the current filters (not only the first 10 visible).

Sales: car, team, monthly, detail totals in integer cents; row count is sales rows, not distinct invoices.
Operational: car/team totals based on appointment statuses, monthly total from dated monthly cohorts; completion rate is recomputed from summed numerator and denominator, never sum of percentages. Quantity sums executedQuantity.

Localization: carsTeamsReports.total is appended to the existing central AR/EN dictionary. No translation engine modification.

Root cause: no footer in seven tables. Impact: missing clear totals and pagination ambiguity. Scope: index.html, assets/js/cars-teams-reports.js, assets/js/localization-center.js, assets/css/cars-teams-reports.css. Risk: operational records with invalid scheduledDate can differ between car/team and monthly tables; monthly report intentionally only groups valid YYYY-MM dates, consistent with existing logic. Live regression pending. No SQL/RPC permissions or financial source changes.

Verification: JS syntax, number of footer nodes, translations. Live rendering and accounting regression pending.
