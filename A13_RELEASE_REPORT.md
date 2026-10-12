# A13 — Discount ABS reporting correction

## Baseline / dependencies
Uses **A13_Filter_Labels_Fix/assets/js/sales-reports.js**, carrying forward the two approved customer/team label repairs on top of A12. Do not overlay an older A12 file afterward.

## Root Cause
The report summed signed `discount_amount` values, canceling positive and negative source discounts. The invoice detail merger also summed signed values across same-invoice lines. The discount graph used a signed denominator (`beforeTax + signedDiscount`).

## Impact
For the verified all-years dataset: positive discounts SAR 50,175.87 + magnitudes of negative discounts SAR 42,668.09 = **SAR 92,843.96**. Gross basis for the existing report's discount-rate formula is `beforeTax + sum(abs(discount))`, equal to **SAR 1,257,607.65** for the validated all-years dataset; indicative rate 7.383% (2–3 decimals depend on existing formatter). This is the application's selected analytical convention, not a change to actual sales or VAT values.

## Scope
Only `assets/js/sales-reports.js`. Five targeted expressions in three owners: invoice detail merge, `summarize()`, and `renderDiscount()`. **Do not modify `normalizeRow()`** so that raw RPC/source signs remain intact.

## Regression risk
Medium: discount KPI, aggregated invoice detail discount column, analysis graph and rate change as intended. Sales totals, tax, invoice count, average, payment breakdown, SQL, RPC, cache, filters and permissions unchanged. Recheck combined invoices with mixed-sign line discounts and the monthly/year filters in browser.

## CSS Ownership / Cascade Audit
No CSS changes; canonical `assets/css/sales-reports.css` is untouched. No layered overrides.

## Acceptance
- No negative discount shown as a negative amount in report breakdown after row-by-row abs.
- For **all years / all filters**, discount KPI and chart total: **SAR 92,843.96** (same snapshot as previous live audit).
- Total sales **SAR 1,322,168.83**, before tax **SAR 1,164,763.69**, tax **SAR 157,410.53**, cash **SAR 171,800.01**, and invoice count **2606** must remain unchanged for the same snapshot.
- Live browser checks still required; static checks cannot certify deployed UI.

## Deployment
Overlay the single file at the original path. Don't clear IndexedDB/offline queue. Refresh page to load changed JS. Verify prior filter-label A13 fix still present.
