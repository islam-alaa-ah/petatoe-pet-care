# A6 — Sales Daily Chart Layout & Comparison Dashboards

STATUS: LOCAL PASS / LIVE VISUAL AND FINANCIAL VERIFICATION PENDING
BASELINE: A5_Sales_Comparisons.zip (only official A5 package used)

## ROOT CAUSE
- Daily SVG used a fixed 1000px viewBox with 300px fixed height; on wide desktops it left substantial empty width around the plot.
- Comparative reports contained tables only, with no summary area before their tables.

## IMPACT
- Daily chart was visually undersized relative to its full-width card.
- No at-a-glance year, quarter, and month summary KPIs.

## SCOPE / CHANGES
- assets/js/sales-reports.js: chart derives SVG width from chart container and adjusts on window resize; dashboard KPI cards are computed from precisely the same year/quarter/month arrays as each comparison table. Both languages supported.
- assets/css/sales-reports.css: canonical owner only; chart readability and responsive comparison KPIs.
- No index.html change; all comparison host sections already present.
- No SQL, RLS, permissions, financial arithmetic, data or schema changes.

## DASHBOARD KPIS
1. Selected year's sales.
2. Previous year's sales.
3. Sales difference.
4. Percentage change ("New" if previous = 0 and selected > 0).
5. Top year/quarter/month of the selected year's comparison scope.

## REGRESSION RISK
- LOW for data logic (existing comparisonYears and comparisonTable unchanged).
- MEDIUM for responsive rendering until verified in browser across supported viewports, including Arabic/English and dark/light.
- Live financial figures NOT CERTIFIED pending direct Supabase reconciliation.

## TESTS
- node --check assets/js/sales-reports.js PASS
- node tests_a6.cjs 13/13 PASS
- node tests_a5.cjs 11/11 PASS

## NEXT CHECK
- Open Sales Reports; verify chart uses card width and scrolls on narrow screens.
- Verify dashboard values match corresponding table totals in each of three comparisons.
- Verify quarter amounts equal three corresponding months.
- Validate year and previous-year source totals against live database before financial sign-off.
