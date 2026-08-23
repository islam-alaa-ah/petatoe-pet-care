# P5.13.8.70R1 — Vehicle Treasury SQL Hotfix

## Root Cause
`get_vehicle_treasury_workspace()` defined two output columns named `car_name` inside `allowed_teams` (`t.car_name` and `c.name AS car_name`). PostgreSQL therefore raised `42702 / column reference "car_name" is ambiguous` when the RPC executed.

## Fix
- Replaced only `public.get_vehicle_treasury_workspace(...)`.
- `allowed_teams` now exposes one canonical `car_name`: `appointment_cars.name`, with safe fallback to the legacy `installation_teams.car_name`, then team name.
- Qualified CTE/subquery fields explicitly to prevent the same ambiguity pattern in search, JSON output, summaries, and ordering.
- No table/RLS/permission/invoice/financial logic changes.

## Regression Scope
Unchanged: cash-invoice qualification, team permission filtering, expense CRUD, balance math, vehicle/team filters, Desktop/Mobile UI, Offline/Smart Sync.

## Deployment
Run only:
`supabase/migrations/phase_p5_13_8_70r1_vehicle_treasury_car_name_hotfix.sql`

The original R70 migration does not need to be rerun.

## Manual Verification
1. Open Vehicle Treasury and confirm the workspace loads without the ambiguous-column error.
2. Confirm allowed vehicle/team dropdown is populated.
3. Verify cash invoice revenues, expenses, balance, count, date filters and search.
4. Test with a restricted user and confirm only permitted teams/cars appear.
