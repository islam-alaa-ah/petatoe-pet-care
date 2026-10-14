# A14.3C — Full Width Reports Layout Fix

## Root Cause
`.a14-analysis-grid` previously split the two reports into unequal adjacent columns (`1fr 2fr`), causing the frequency distribution and Top 10 customer table to share a row.

## Change / Scope
- Canonical owner only: `assets/css/customer-reports-overview.css`.
- Change `.a14-analysis-grid` to one `minmax(0,1fr)` column with `width:100%`, so **توزيع العملاء حسب تكرار الشراء** appears first at full width, and **أعلى 10 عملاء حسب المبيعات المحققة** appears below at full width.
- Remove redundant small-screen grid rule since single-column applies at all viewports.
- The existing `.a14-table-scroll{max-width:100%;overflow:auto}` keeps wide table content scrollable on narrow screens.
- No other CSS owners, HTML, JavaScript, SQL, permissions, calculations or SEA VIBE code changed.

## Verification
- Exactly one owner rule updated; no override layer added.
- Verify in browser on desktop / tablet / mobile and both themes; code inspection does not replace live visual testing.
- Future report sections: each report should be full-width and stacked vertically. KPI metric cards may remain in a grid.

## Regression Risk
Low. Only positioning of the two analysis panels changes; internal table columns and metric cards are unchanged.

## Baseline
Patch based directly on `A14_3C_Customer_Purchases_Analysis.zip`; apply after that phase is installed.
