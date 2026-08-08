# Phase M10.8.12 — Customer Selected Scope Enforcement

## Confirmed root cause

The database mapping for the tested user was correct: the account was linked to its own representative and the selected-access table contained only that same representative. Therefore the data leak was not caused by user configuration.

PostgreSQL combines permissive RLS policies using `OR`. Any obsolete broad `SELECT` policy on `public.customers` could therefore allow rows outside the canonical representative scope. In addition, the frontend customer request was not explicitly constrained by the authenticated user's representative scope, and each page requested 1,000 joined rows, which increased the risk of statement timeout.

## Changes

- Replaced all customer SELECT policies with one canonical scoped policy.
- Hardened `can_access_representative(uuid)` for `own` and `selected` modes.
- Prevented `sales_representative` accounts from becoming globally unscoped through an accidental `access_mode = all` value.
- Added an explicit representative filter to the frontend customer query.
- Reduced customer query pages from 1,000 to 250 rows.
- Added indexes for representative-scoped customer paging and selected-access lookup.

## Modified files

- `assets/js/customers-service.js`
- `supabase/migrations/phase_m10_8_12_customer_selected_scope_enforcement.sql`
- `supabase/verification/phase_m10_8_12_customer_selected_scope_enforcement_verification.sql`

## Deployment

1. Run the migration in Supabase SQL Editor.
2. Upload `assets/js/customers-service.js`.
3. Sign out and sign back in as the sales representative.
4. Open Customers and confirm only the permitted representative's rows are returned.
