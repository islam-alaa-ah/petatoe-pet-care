# A17.3.3.2 — Service Sales Attribution Guardrails

## Delivered
- New switch in A17 service dashboard: confirmed execution quantities vs **historically classified service sales**.
- Three full-width, stacked financial visual panels (monthly classified trend, classified service change, service sales share); each has collapsible detail table.
- Classified historical sales attributed only when a reliable `service_type_id` is present, not unspecified and not `cash_aggregate`.
- **Current** financial invoice totals are fetched through canonical `sales_reports_rows_r44r38r20r35()` and shown only in the **unattributed** bucket, never distributed to request-service lines. This avoids duplicating manual invoices linked to installation requests (Q6).
- Nonclassified historical sales remain unattributed. Monthly financial aggregation runs in integer halalas and enforces reconciliation nonnegative guard.
- Read-source verification, explicit failures instead of displaying partial pages. Existing execution-report source/code and A14 remain untouched.

## What is NOT claimed
- No current invoice-level service amount allocation (not auditable from Q3–Q6).
- No verification of dynamic live data or screenshots; requires authenticated production test.
- No schema, RPC, RLS, permissions engine or financial source modifications.

## Install
Replace `index.html`, `assets/css/advanced-analytics.css`, `assets/js/localization-center.js`; add `assets/js/advanced-analytics-service-finance.js`. Cumulative on top of A17.3.3 (index/styles/localization are from that bundle).

## Important regression watch
If you subsequently applied patches to index/styles/localization AFTER A17.3.3, compare or merge rather than replace blindly. A17.3.3.2 uses A17.3.3 package as its explicit starting point.
