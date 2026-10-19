# A17.2.1 — Advanced Analytics Foundation

## Scope
Created dedicated Advanced Analytics navigation and independent view, centralized bilingual interface strings, permission-gated sales dashboard, verified paginated source load and duplicate detection, selectable comparison: contiguous previous period or matching year-earlier period, expandable sales detail table, and screen-specific CSS.

## Limits / Explicitly Deferred
* Other analytical diagrams are deliberately placeholders with no fabricated production numbers. They require source-validation phases.
* Balanced alert thresholds (sales -15%, retention -5 pp, service volume -20%, peak workload +30%, inactive customers +15%) remain proposed until sample-size rules and live evaluation are approved.
* A new `advancedAnalytics` permission key must be registered using the project's existing canonical permissions process; no permission/RLS/SQL changes were deployed.
* Year selection includes all 12 months but future months are removed; partial current month suppresses growth rate. Previous-period comparison uses same number of calendar months.
* Compare full-year historical figures against equivalent date-scoped periods only after comprehensive source review; this foundation does not claim full reporting parity for other domains.
* LIVE test of new navigation, role scope, translations and monthly sums is pending.

## Verification
Syntax checks with node --check for all modified JS passed. HTML unique ID checks passed. Static integration checked. No production writes.

## Files
index.html
assets/js/app.js
assets/js/localization-center.js
assets/js/translation-center.js
assets/js/advanced-analytics.js (new)
assets/css/advanced-analytics.css (new)
