# A13 Dashboard KPI & Filters Audit

Baseline: A12 sales-reports.js after A11. Read-only analysis.

## Source findings
- `summarize`: filters `recordType !== 'cash_aggregate'` before historical invoice grouping, counting and average invoice. Gross total, before tax, tax, payments all include `cash_aggregate`.
- UI filters: year, month, car, customer, team, canonical payment method, invoice status.
- Page load: 500 rows/page and duplicate-ID checks; cached rows may be used unless a forced refresh.
- Discount analysis chart uses `(beforeTax+discount)` as denominator and `discount / (beforeTax+discount)`; historical discounts carry both positive and negative source values. Business meaning not validated.
- `aggregateInvoiceRows` groups historical rows by invoice number+date+customer; independent true-invoice-count audit still pending.
- Year/quarter/month comparison charts anchor to a year (or currentYear for all years), rather than always mirroring main KPI time filters.

## Live test
1. Open Sales Reports, choose filters, press Apply Filters; press Update Data first for a fresh result.
2. Open browser DevTools Console; paste the complete contents of `A13_DASHBOARD_LIVE_READONLY.js`.
3. Send back console tables **A13 DASHBOARD — INTEGRITY**, **KPI VS LIVE RPC**, **PAYMENT BREAKDOWN**, **DISCOUNT SIGN DIAGNOSTIC** and selected filters.
4. Repeat once with All Years / All Months, and once with year 2025 and month September, if needed.

No SQL/RLS/CSS/production source changes are included. This is a diagnostic tool, not a fix.
