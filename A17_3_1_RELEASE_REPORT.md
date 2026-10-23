# A17.3.1 — Smart analytics dashboard shell

## Changed files
- `index.html`: section navigation, KPI heading, full-width analytics section anchors. A14 customer panel stays in the customer reports view.
- `assets/css/advanced-analytics.css`: scoped executive dashboard visual system, responsive KPI cards and report panels, no changes to A14 styles.
- `assets/js/advanced-analytics.js`: KPI display metadata and in-page navigation only; no finance formula, RPC, filtering or pagination changes.
- `assets/js/localization-center.js`: localized navigation and dashboard headings in the centralized registry.

## Verified statically
- Node JS syntax checks for changed JS files.
- No duplicate IDs in `index.html`.
- No reintroduced customer analytics in A17.
- Sections full width and stacked; service/peak/insight panels remain placeholders without invented metrics.

## Still requires live testing
- Arabic/English and desktop/mobile visual rendering
- Permission scope and feature navigation
- Source reconciliation and operational-report success on Production

No SQL, RPC, RLS or offline sync modifications. Apply this patch on top of A17_A14_Retention_Cohort_Drilldown_Fix and A14_Customer_Cohorts_Days_Descending.
