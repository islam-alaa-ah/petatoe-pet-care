# Phase 17.4-B.1 — Audit Log FK Canonicalization

## Confirmed Root Cause

`audit_logs.user_id` had two foreign keys to `user_profiles.id`:

- `audit_logs_user_id_user_profiles_fkey`
- `audit_logs_user_profile_fkey`

PostgREST therefore returned:

`Could not embed because more than one relationship was found for 'audit_logs' and 'user_profiles'`

## Decision

Keep:

`audit_logs_user_profile_fkey`

because it uses `ON DELETE SET NULL`, preserving historical audit rows when a
user is removed.

Remove:

`audit_logs_user_id_user_profiles_fkey`

The `ON UPDATE CASCADE` behavior on the duplicate constraint is not required for
UUID identity keys, which should not be mutated.

## Files

- `supabase/migrations/phase17_4_b_1_audit_log_fk_canonicalization.sql`
- `supabase/verification/phase17_4_b_1_audit_log_fk_verification.sql`
- `PHASE17.4-B.1_VERIFICATION.md`

## Execution

1. Run the migration SQL in Supabase SQL Editor.
2. Confirm only one `audit_logs.user_id` relationship remains.
3. Run the verification SQL.
4. Expected:
   - `relationship_count = 1`
   - `canonical_constraint = audit_logs_user_profile_fkey`
   - `preserves_audit_history = true`
   - `overall_result = PASS`
5. Hard refresh the application and open Activity Log.
