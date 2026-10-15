# A14 Financial Reconciliation Fix — staged / live verification pending

Baseline: A14_3G3_Neighborhood_Filter.zip. Only original files `index.html` and `assets/js/customer-reports-overview.js` modified. CSS, SQL, RPC, roles, source invoices and SEA VIBE unchanged.

Root cause: previous monthly buckets were built only for attributed customer rows; `cash_aggregate` and invoice lines with null `customer_id` were excluded from the time-series. This caused the customer monthly and yearly displayed total to differ from full-company Sales Reports totals.

Fix: for every fetched source row, classify its VAT-inclusive monetary amount in integer cents and month, then accumulate total, attributed and unattributed buckets. Do not invent customers or invoices for unassigned sales. Expose three figures in monthly/yearly tables. Validate per-month reconciliation and yearly/whole-scope rollup before display. Explicitly disclose that choosing a customer/neighborhood narrows the scope, so its total is not comparable with unfiltered company totals. Force updated JS asset on next navigation/reload through version query, no mid-use forced reload.

Live read-only audit snapshot supplied by user (2026-10-15T21:32:01.541Z): 3540 rows; 825 visible customers; 22 months; total 1,328,767.80 SAR, attributed 1,191,701.33 SAR, cash 115,052.47 SAR, unassigned invoice_line 22,014.00 SAR; remainder 0.00 SAR.

Verification: Node syntax PASS; synthetic regression PASS for multiline invoice counted once, month with unattributed-only sales, cash aggregates, cent-level reconciliation, month/year column counts, invalid date and out-of-scope customer fail-closed. Source snapshot was NOT replayed inside the patched browser; no deployment or cross-screen live signoff claimed.

Risks/pending: sales screen may use a cached snapshot; compare only after refreshing both and matching filters/data snapshots. No claim that every report's financial amounts across the app have been reconciled. CSV inherits existing current behavior (it exports visible table rows only); unchanged. Validate filter scenarios and role permissions in live app. The original 3540-row source figure can change with new invoices, so compare against simultaneous snapshot, not a fixed historical benchmark.
