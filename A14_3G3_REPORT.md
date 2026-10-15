# A14.3G.3 — Neighborhood filter (controlled scope)

## Baseline
A14_3G2_Customer_Detail_Report.zip. Includes prior A14 fixes as inherited from this archive. This package does not modify database, RPC, sales reports, or SEA VIBE.

## Change
- Added a neighborhood filter in dedicated Customer Reports, sourced from visible CustomersService `neighborhoodId`, with names only when already present in authorized sales RPC rows.
- Applied filter to the customers and their sales using customer IDs within the current visible scope. Excludes unassigned sales from any particular neighborhood to prevent fictitious attribution.
- Included neighborhood in applied filter summary and reset.
- Updated filter layout to 4 columns on desktop while retaining existing mobile single-column rule.

## Root cause / impact / scope / risk
- Coverage gap: neighborhood filter missing; no defect proven in existing financial logic.
- Impact: reports and displayed KPIs are recalculated using filtered customers and their associated sale rows; when a neighborhood is selected, unassigned sales are intentionally excluded.
- Scope: index.html; assets/js/customer-reports-overview.js; assets/css/customer-reports-overview.css.
- Regression risk: medium. Existing sales reports, calculations and Supabase permissions untouched. Customer with a neighborhood absent from sales receives a fallback abbreviated ID label; do not infer its name.

## Pending before approval
- Live check of options against visible customers and neighborhood IDs, particularly unnamed neighborhoods.
- Verify scoped sales/KPIs and reset with different years/customers, mobile/light/dark, and roles.
- Representative filter and Customer 360 direct jump remain gated until the source/permission and navigation bridge is verified, not implemented in this patch.
- CSV continues its prior A14.3G.2 behavior; this stage does not modify export semantics.
