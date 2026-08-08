# Phase 5A Policy Hotfix

## Root Cause

The dynamic `CREATE POLICY` statements used PostgreSQL `format()` with `%L`.
`%L` creates a string literal, but a policy name must be an SQL identifier.
This produced:

`syntax error at or near "sales_orders read authorized"`

The corrected file uses `%I` for policy names and adds `DROP POLICY IF EXISTS`
before recreating each generated policy.

## What to do

1. Delete the SQL text currently open in Supabase SQL Editor.
2. Open the corrected file:
   `supabase/phase5a_enterprise_foundation.sql`
3. Copy the entire file into a new query.
4. Click Run.
5. If Supabase displays the security warning, choose:
   `Run without RLS`
   because the SQL file itself enables RLS and creates the intended policies.
6. Do not run `phase5a_verify.sql` until this file finishes successfully.

The failed previous execution was wrapped in `BEGIN ... COMMIT`, so PostgreSQL
should have rolled back the entire Phase 5A transaction automatically.
