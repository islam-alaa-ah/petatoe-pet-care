# P5.13.8.50R1 — Completion Workspace Return Contract Fix

## Root cause
The P5.13.8.50 migration changed the first OUT column name of the existing function
`public.update_installation_completion_workspace(uuid,uuid,jsonb,numeric,jsonb)` from `id` to `request_id`.
PostgreSQL treats OUT parameter names as part of the function return row type, so `CREATE OR REPLACE FUNCTION`
rejected the migration with SQLSTATE `42P13`.

## Fix
- Preserve the existing function signature and exact return contract:
  `returns table(id uuid, request_number text, final_amount numeric, discount_amount numeric)`.
- Keep the P5.13.8.50 request-service identity implementation unchanged.
- No `DROP FUNCTION` is required.
- Updated the migration manifest hash/size for the corrected SQL file.
- Added a regression assertion that the historical PostgREST return contract remains unchanged.

## Scope
Database migration contract only. No UI, runtime JS, CSS, permissions, scheduling, execution, collection, invoice, or report logic changed.

## SQL
Run the corrected migration once. The previous attempt failed before commit, so no rollback is required.
