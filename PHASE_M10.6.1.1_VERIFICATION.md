# Phase M10.6.1.1 — Explicit User Execution Fix

## Root Cause

Supabase SQL Editor runs as `postgres`, so `auth.uid()` returns `NULL`. The original verification called the RPCs without an explicit user ID, which caused `User is required`.

A second scope issue was corrected at the same boundary: generation for a target user now evaluates that target user's representative-access profile instead of evaluating the caller's scope.

## Modified Database Functions

- `can_user_access_representative(uuid, uuid)` — new target-user scope helper.
- `replenish_daily_customer_suggestions(uuid, date)` — accepts explicit target user and preserves app authorization.
- `ensure_daily_customer_suggestions(date, uuid)` — clear SQL Editor error when no user is supplied.
- `get_daily_customer_suggestions(date, uuid)` — supports explicit SQL Editor execution.

## Compatibility

Existing application calls remain compatible because parameter order and defaults were preserved. Authenticated users may still generate only their own list unless their role is `super_admin` or `sales_manager`.

## Run Order

1. Run `supabase/migrations/phase_m10_6_1_1_explicit_user_execution_fix.sql`.
2. Run `supabase/verification/phase_m10_6_1_1_explicit_user_execution_verification.sql`.
3. Confirm:
   - a verification user is returned;
   - both RPC calls complete without `User is required`;
   - each active category count is no greater than 10;
   - duplicate query returns zero rows.
