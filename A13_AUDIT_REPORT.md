# A13 — Sales Reports Certification Audit

STATUS: HOLD / FINAL PASS NOT YET AUTHORIZED

BASELINE: ZIP repository 2026-10-12 + A11 assets + A12 updated sales-reports.js (read-only review)

## Checks supported by local evidence
- JS syntax: PASS (`node --check` A12)
- A11 targeted static checks: 20/20 PASS
- Sales Reports page, year/month/vehicle/customer/team/payment/status filter controls: PRESENT
- `sales_reports_rows_r44r38r20r35()` endpoint with 500-row pages, completion guard, duplicate-row guard: PRESENT in frontend
- Annual/quarter/month comparisons take data from the same normalized `allRows` dataset: PRESENT
- Chart year/month/quarter values built from sums of report-row inclusive totals: PRESENT
- Historic `cash_aggregate` excluded from count and average invoice: PRESENT
- Payment grouping on normalized keys: PRESENT
- Payment total display skips zero-value `غير محدد`: PRESENT
- No Sales Reports export handler in reviewed JS; `can_export` permission alone is not equivalent to an export feature: GAP

## Findings / certification blockers
1. FINANCIAL SOURCE (HIGH): Baseline SQL RPC migration computes historical `tax_amount` as `max(inclusive - before_tax, 0)` rather than using historical `h.tax_amount`. A2 supplied a revised migration, but the deployed function definition and live schema are unverified. Compare live pg_get_functiondef before concluding whether this is still active.
2. LIVE PARITY (HIGH): No live authenticated row counts, totals, or monthly/yearly source-to-RPC reconciliations provided. Prior screenshots showing 2025=700385.55 and 2026=621620.28 are NOT independent accounting proofs. The 2026 value covers the data available at that time, not necessarily a complete calendar year.
3. CACHE AND PERMISSION (MEDIUM): Frontend accepts cached rows using allowStale up to 30 days; cached results are namespaced by application user ID, but changes in access scope/permissions and subsequent edits still require a forced refresh to certify current totals.
4. FILTER CONTRACT (MEDIUM): Annual comparisons intentionally ignore month, but honor the other filters. Main KPIs honor month. 'All years' keeps year comparison anchored on currentYear: UX interpretation should be documented.
5. INVOICE SEMANTICS (MEDIUM): `aggregateInvoiceRows` groups current by rowId, historical by invoice number/date/customer; validate grouped counts against source invoice IDs and verify NULL/duplicate historical invoice references.
6. LOCALE/VISUAL (MEDIUM): Static/source tests do not demonstrate English and RTL rendering on browser. Mobile/tablet/desktop + hover/focus tooltip need hands-on browser check.
7. EXPORT GAP (LOW): No export implementation found in current Sales Reports frontend, despite export rights in permission registry.
8. MIGRATION MANIFEST (MEDIUM): Repository migration manifest was noted previously as stale vs newer migrations. Revalidate before fresh deployment (out of A13 reporting runtime changes scope).

## Approval gates
- SQL Editor: run `a3_live_completeness_audit.sql` (read-only); save all result sets.
- SQL Editor: run `a2_readonly_live_reconciliation.sql` (read-only); inspect source VAT anomalies; never mutate historical amounts.
- SQL Editor: inspect deployed function definition with: `select pg_get_functiondef('public.sales_reports_rows_r44r38r20r35()'::regprocedure);` (read-only). Verify A2 is deployed if expected.
- Under authenticated salesReports.view users: compare returned rows/totals by year, month, `is_historical`, `record_type`; test allowed and denied roles separately. SQL Editor superuser results cannot certify RLS/permissions.
- Verify invariant: sum(months)=sum(quarters)=annual total; sum(payment methods)=same total under identical filters; invoice count and average exclude `cash_aggregate`; compare VAT original values/financial_delta separately.
- Visual browser matrix: Desktop, Tablet, Mobile; Arabic and English; filtered and all-year/month cases; hover and keyboard focus tooltip; payment table responsiveness.

## Root cause / impact / scope / regression risk
ROOT CAUSE: Verification gap between local frontend improvements and actual deployed RPC financial source, plus mixed temporal filter semantics and missing authenticated-data reconciliation.
IMPACT: Dashboard may appear internally consistent while live reporting amounts or tax can differ from sources/permission-scoped data.
SCOPE: Read-only audit; no code, SQL, RLS or CSS changes made.
REGRESSION RISK: None introduced by audit. Reporting sign-off risk HIGH until parity and browser gates pass.

RESULT: LOCAL SOURCE REVIEW COMPLETE; FINAL CERTIFICATION = PENDING LIVE AND BROWSER TESTS.
NEXT APPROVED PHASE: A13 Live DB Reconciliation, then role-filter/browser verification and only issue-scoped fixes as needed.
