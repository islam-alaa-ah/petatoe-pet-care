# Phase M10.6.1 — Daily Customer Suggestion Engine

## Root Cause

The previous frontend-only report recalculated `ORDER BY ... LIMIT 10` on every load. It had no persisted daily assignment, so refreshes could change the list and there was no reliable daily completion history.

## Implemented Scope

- Added persisted `daily_customer_suggestions` table.
- Added RLS: each user sees their own list; `super_admin` and `sales_manager` can read all lists.
- Added deterministic daily selection using Riyadh business date.
- Generates and maintains up to 10 companies and 10 individuals per user.
- Excludes customers already contacted on the same day.
- Respects `can_access_representative(...)` data scope.
- Added stable ordering: never contacted, oldest contact date, oldest creation date, customer number, UUID.
- Added completion RPC that validates the saved follow-up and replenishes the category automatically.
- Added enriched read RPC with representative and latest quotation data.

## Files

- `supabase/migrations/phase_m10_6_1_daily_customer_suggestion_engine.sql`
- `supabase/verification/phase_m10_6_1_daily_customer_suggestion_engine_verification.sql`

## Important

Run the migration in Supabase SQL Editor before activating the frontend integration in Phase M10.6.2/M10.6.3.
