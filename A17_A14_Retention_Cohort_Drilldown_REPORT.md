# A17/A14 customer retention cohort drill-down repair

Base: A17_A14_Full_Width_Customer_Analytics_Move.zip.

Changed:
- index.html: add actions column to retention detail table.
- assets/js/advanced-analytics-customers.js: each of five retention cohorts opens customer detail view with existing WhatsApp, call, follow-up and contacted actions.
- Preserve authorized customer scope, comparison ranges, data source and retention metrics.
- Select last documented sale and transaction count as of selected cohort cutoff (reference-only rows use reference end).
- Reuse existing follow-up service and bridge.
- Preserve title translation when language switches.

Checks: JavaScript syntax (node --check), archive integrity, DOM IDs and wiring static checks. Live browser / role-based permission checks pending.

Installation: apply these modified paths over the already deployed A17_A14_Full_Width_Customer_Analytics_Move baseline.
