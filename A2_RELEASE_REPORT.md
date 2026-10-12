# R44R38R20R35A2 — Sales Reports Financial Data Contract Recovery

## State
Code package created and local checks passed. **Not deployed. Live data parity / role permission checks remain pending.**

## Approved scope
- `assets/js/sales-reports.js`: apply explicit status-filtered data consistently to KPIs, charts and invoice table. Exclude `cash_aggregate` from invoice count and average invoice numerator/denominator while keeping its revenue in sales/payment totals. The neighborhood report retains aggregate revenue in `غير محدد` but no longer counts cash aggregates as invoices.
- `supabase/migrations/phase_r44r38r20r35a2_sales_reports_financial_contract.sql`: only replaces existing report read RPC, preserving the original output signature, permission checks, joins and grants; historical `tax_amount` reads `h.tax_amount` instead of being derived from sales inclusive minus pre-tax.
- `tests/a2_sales_contract_test.cjs`: isolated assertion checks.
- `tests/a2_readonly_live_reconciliation.sql`: read-only live reconciliation query.

## Root cause
Historical tax was reconstructed in the report RPC, masking source inconsistencies. Status-filtered sales were mixed with issued-only invoice table data. Cash aggregates were treated as invoices for counts and averages.

## Impact / risk
Historical tax KPI and financial mismatch indicator can change when the new read RPC is installed. Average invoice and count can decrease/correct because cash aggregates cease to count as invoices. Total revenue and payment distribution stay on report source amounts. No financial source table is changed.

## CSS ownership / Regression
No CSS files modified. No new override layers. No invoice creation, payment, storage, sync/ACK, role, RLS or current invoice calculations changed.

## Important limitations / follow-ups
- Historical source may contain anomalies whose signed total cancels; examine row-level mismatches rather than the aggregate delta alone.
- The neighborhood chart still attributes cash aggregate revenue to `غير محدد` where no customer is associated; this is transparent but must be approved before a new grouping policy is added.
- Monthly trend is a full-year overview by design and not forced to the month selected; other charts and KPIs use the selected period.
- The status KPI displays issued share of the filtered data; when filtering to cancelled-only it will be zero, by design.
- New reporting output should be confirmed with users whose permissions differ; no live DB connection in this package.
- Deploy SQL migration before the frontend file to avoid brief mixed-contract operation. After deployment use hard refresh only if needed, then Refresh inside Sales Reports to invalidate its cached report rows.
- Migration manifest lag is an existing, separate deployment governance risk; this package deliberately does not modify unrelated ledger entries.

## Verification sequence
1. Before SQL deployment, run `tests/a2_readonly_live_reconciliation.sql` and capture actual totals and anomaly invoices.
2. Deploy the A2 SQL migration; compare source and RPC totals, and tax columns under an authenticated view-granted account.
3. Replace the single frontend JS file; test issued, cancelled, all, year/month, payment, car/team/customer filters and two distinct roles.
4. Compare invoice count and average against invoice-only grouped records; compare payment totals against all source records.
5. Only mark PASS once live checks are clean and known mismatches are visible rather than silently normalized.

## Local tests
`node --check assets/js/sales-reports.js` — PASS
`node tests/a2_sales_contract_test.cjs` — PASS (13 assertions)
SQL execution and DB actuals — NOT RUN (no connected live DB)
