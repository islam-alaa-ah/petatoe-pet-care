# A11 — Sales Reports Visual Refinement

PHASE: A11
STATUS: LOCAL SOURCE VALIDATION PASS — LIVE VISUAL VERIFICATION PENDING

ROOT CAUSE:
- The payment table had a flexible full-width grid column while the donut was fixed at 215px.
- Selected-year monthly labels used bar heights up to 100% without reserving room above the maximum.
- Monthly comparison labels were offset sideways, weakening the visual association with their respective bars.
- Weekday report values occupied a fixed top row, not a position above the bar top.
- Small axis-label margins and uneven font scales reduced clarity.

IMPACT:
- Presentation-only adjustments to sales report graphs and tables. No source financial values are changed.

SCOPE:
- assets/js/sales-reports.js
- assets/css/sales-reports.css

CHANGES:
1. Payment: limit table width (max 560px), enlarge donut (280px), maintain RTL desktop table-right/chart-left layout; small-screen one-column layout.
2. Selected-year months: cap tallest bar at 82% plot height, maintain dynamic labels above bars with safe headroom.
3. Comparison of months: center numeric labels above each corresponding bar; vertically stagger close values; enlarge min chart width for 12 months.
4. Weekday sales: place labels above their own bars, reserve 20% upper headroom, improve font size.
5. General typography: reinforce headings, labels, and comparison table readability within Sales Reports only.
6. Daily sales: increase left margin and axis text separation from line/area plot, retain all days and interactive tooltips.

CSS OWNERSHIP/CASCADE AUDIT:
- Canonical CSS owner: assets/css/sales-reports.css.
- Existing rules were edited in place; no added override file or appended cascade layer.
- Mobile CSS duplicate donut size declaration cleaned.

REGRESSION AUDIT:
- `node --check assets/js/sales-reports.js`: PASS
- `node tests_a11.cjs`: 20/20 PASS (source-structure checks only)
- Runtime browser visual QA across Desktop/Tablet/Mobile and production financial reconciliation: PENDING.

REGRESSION RISK:
- Financial/business logic: low (unchanged).
- UI/responsive: medium until browser visual confirmation.

DATABASE / RPC / PERMISSIONS:
- No changes.

RESULT:
- Code-ready locally, NOT certified visually on the deployed application.
