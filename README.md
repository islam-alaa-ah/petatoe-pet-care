# A13 — Filters & Discount Live Audit (READ ONLY)

## Baseline / context
Based on A13_Filter_Labels_Fix/assets/js/sales-reports.js built on approved A12, and prior successful 3,141 historical / 3,526 combined rows reconciliation. No program files changed in this delivery.

## Root Cause / Impact / Scope / Regression Risk
- Root cause for previous blank option labels: customer/team options used `x.label` instead of `x.name`; A13 filter labels fix already delivered. This package tests the live deployment; it does not presume deployment.
- Potential financial concern: discount values include both positive and negative entries; `renderDiscountAnalysis` computes `gross=beforeTax+discount`, `rate=discount/gross`. Whether signed values represent consistent discount semantics remains unverified.
- Scope: DevTools console read-only script. No application files modified, no RPC, SQL, RLS, CSS, or data updates.
- Regression risk: none to persisted app data. Reads up to 100k RPC rows via pagination; network load is transient.

## Run
1. Deploy previous A13_Filter_Labels_Fix if not already deployed.
2. In Sales Reports, select all years and all other filters, then Apply Filters + Update Data.
3. Open Chrome DevTools Console and paste the *entire* A13_FILTERS_DISCOUNTS_READONLY.js file as JavaScript (do not paste ZIP/README/JSON).
4. Provide results from OPTION INTEGRITY, PARTITION RECONCILIATION, DISCOUNT SIGN SPLIT and DISCOUNT FORMULA BY YEAR.
5. `missing_options` might flag legitimate UI design choices; investigate before changing app. `unassigned_rows` count reflects source records without a selectable entity id, not necessarily a bug. `partition_delta` should be 0.00 regardless.
6. Console script does not apply filters, change UI, read/write local storage, or update DB.

## CSS ownership/cascade audit
No CSS changed. Existing canonical owner assets/css/sales-reports.css left untouched.

## Follow-up decisions
- Verify customer/team dropdown labels in both Light/Dark after deploying previous fix.
- Compare selected filter scenarios against KPI read-only checker separately. This audit tests source grouping and options but not every combination against the rendered KPI.
- Before changing discount calculation, validate business sign convention and original imported discount semantics for representative positive and negative rows. Do not flip negative values or double subtract discounts automatically.
