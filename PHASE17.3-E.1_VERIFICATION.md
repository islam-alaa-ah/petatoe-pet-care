# Phase 17.3-E.1 — Daily Alerts RPC Operational Fix

## Confirmed Root Cause

The deployed RPC:

`public.sync_daily_operational_alerts(date)`

referenced:

`customer_followups.completed`

The production table uses:

`customer_followups.is_completed`

PostgreSQL therefore returned:

`42703: column f.completed does not exist`

## Fix

- Recreated the RPC with `f.is_completed`.
- Preserved the existing alert generation logic.
- Removed public and anonymous execution.
- Preserved authenticated and service-role execution.
- Added read-only verification.

## Modified Files Only

- `supabase/migrations/phase17_3_e_1_daily_alerts_rpc_fix.sql`
- `supabase/verification/phase17_3_e_1_daily_alerts_rpc_verification.sql`
- `PHASE17.3-E.1_VERIFICATION.md`

## Execution

1. Run the migration SQL in Supabase SQL Editor.
2. Confirm `overall_result = PASS`.
3. Refresh the application.
4. Open Daily Operations / Followups.
5. Confirm the Network request:
   `rpc/sync_daily_operational_alerts`
   returns HTTP 200 instead of HTTP 400.
6. Run the read-only verification file if required.

## No Frontend Changes

The frontend already sends the correct RPC name and date payload.  
No JavaScript modification was necessary.
