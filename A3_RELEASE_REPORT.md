# R44R38R20R35A3 — Sales reports completeness and filter consistency

STATUS: CODE READY / LIVE DB RECONCILIATION PENDING. Baseline: uploaded 2026-10-12 ZIP. Includes previously prepared A2 contract migration (NOT yet proven deployed).

## Verified root causes in source
1. Single unpaginated PostgREST RPC invocation can silently truncate the DESC-ordered result to the PostgREST server-side max_rows limit. The year/month options are computed only from received rows, hence historical years/months disappear when truncated. This mechanism explains the screenshot pattern but whether the live gateway limit is 1000 must be checked on live data.
2. `selectedFilters()` used `|| currentMonth()` so blank option `كل الشهور` turned into the current month. Fixed explicit empty-option sentinel.
3. Status `الكل` used `|| 'صادرة'` and `populateFilters` forcibly selected `صادرة`. Fixed proper empty selection without implicit status.
4. `renderMonthly` intentionally shows a 12-month *year overview* ignoring the selected month. Keep this semantics for a separate full-year comparison; the main KPI/charts correctly respect selected month. Zeros no longer display a nonzero bar.
5. Prior A2 fixes retained: source historical VAT and invoice/cash aggregate semantics; these require A2 migration deployed before JS.

## Files
- assets/js/sales-reports.js — canonical JS owner (A2 improvements + A3 fetch/filter changes)
- supabase/migrations/phase_r44r38r20r35a2_sales_reports_financial_contract.sql — carried forward unchanged from A2; install only if not already deployed
- tests/a3_source_guard.cjs — 10 source checks
- tests/a2_sales_contract_test.cjs — 13 regression assertions
- tests/a3_live_completeness_audit.sql — live *read-only* source/date and financial audit

## Checks
- JS syntax PASS
- A3 10 assertions PASS
- A2 13 assertions PASS
- No CSS, financial source table, RLS, role permissions, invoice logic, or Sync/ACK changed.
- No live authenticated RPC source parity, 2025 rows, or monthly financial totals validated. Results in screenshots cannot establish them. Do not mark full FINANCIAL PASS before running the read-only audit with a properly permitted authenticated role and reconciling.

## Deployment notes
1. Backup/deployment window per standard workflow. Run read-only audit and save results.
2. If A2 SQL is absent, deploy the A2 read-only reporting RPC migration before deploying JS. The SQL file replaces a view-report RPC only and preserves grants; do not reapply unnecessarily.
3. Replace assets/js/sales-reports.js; invalidate frontend cache because key is now v3-complete.
4. Refresh page and click تحديث البيانات. Confirm years include 2025 when user has permission and source provides it; month list uses ALL the rows, not a first-page subset.
5. Compare (a) October 2026, (b) all months in 2026, (c) year 2025, (d) all years, and (e) customer/car/team/payment/status combinations against source audit. Monthly chart is per-year regardless of selected month.
6. Block release if pagination fails/errors or source totals disagree. Never silently accept partial data.

## Risks
- 500-row pagination requires stable ordering. RPC orders by invoice_date DESC, row_id DESC; pagination will fail-fast if repeated/missing row IDs are encountered, but concurrent inserts during multipage download can shift offsets. For strict transactional snapshots, a server-side paged report RPC with cursor and snapshot is a future design option only after approval.
- SQL Editor owner may bypass ordinary-user application permissions; data completeness must be verified under the same user scope.
- Browser tests and real DB results remain necessary, as do independent review of raw historical VAT mismatches.
- Separate yearly/monthly total chart is a full-year comparison, not an all-months KPI; the copy should make this clear to users.
- Existing migration-manifest backlog remains out-of-scope.

RESULT: LOCAL PASS / PRODUCTION NOT CERTIFIED.
