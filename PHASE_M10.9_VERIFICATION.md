# Phase M10.9 — Enterprise Data Scope Lockdown

## Root Cause

The reporting layer was not uniformly scoped. Customers had an explicit UI filter, while follow-ups and quotations relied only on whichever RLS policies happened to remain installed. Daily Operations and the Reports Engine consume the shared `customers`, `followups`, and `quotations` arrays, so any broad or stale source query propagated into dashboards, reports, and exports.

PostgreSQL combines permissive SELECT policies with `OR`. Therefore, a legacy broad policy could bypass a newer restrictive policy.

## Changes

- Added explicit representative-scope filters to customer follow-up loading.
- Added explicit representative-scope filters to quotation loading.
- Kept a final Daily Operations UI guard to discard stale cross-account rows.
- Added a session-resolution guard before daily-suggestions RPC execution.
- Replaced all SELECT policies on the three core report-source tables with one canonical scoped policy per table.
- Scoped customer-interest reads through the owning customer.
- Added supporting indexes for scoped reporting queries.

## Reporting Coverage

The following now inherit the same scoped source arrays:

- Customers screen and customer analytics.
- Daily Operations: new customers, completed follow-ups, quotations today, overdue follow-ups.
- Dashboard KPIs and analytics.
- Reports Engine reports.
- CSV and other exports generated from the current report snapshot.

## Files

- `assets/js/app.js`
- `assets/js/followups-service.js`
- `assets/js/quotations-service.js`
- `assets/js/daily-suggestions-service.js`
- `supabase/migrations/phase_m10_9_enterprise_data_scope_lockdown.sql`
- `supabase/verification/phase_m10_9_enterprise_data_scope_lockdown_verification.sql`

## Deployment

1. Run the migration in Supabase SQL Editor.
2. Upload the modified JavaScript files.
3. Sign out and sign in again with each test account.
4. Test `own`, `selected`, `sales_manager`, and `super_admin` accounts.
5. Run the verification SQL. Each core table should show exactly one SELECT policy.
