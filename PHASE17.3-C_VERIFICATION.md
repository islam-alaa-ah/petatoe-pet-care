# Phase 17.3-C — Database Cleanup & Canonicalization

## Root Cause

The repository contains three historical definitions of:

`public.restore_kyum_backup_transactional(jsonb, uuid)`

They are Phase 13 migrations/hotfixes for the old ten-table backup format.  
Phase 17.3-A and Phase 17.3-B introduced the canonical manifest-based engine:

- `kyum_backup_table_manifest()`
- `kyum_validate_backup_restore(jsonb, uuid)`
- `restore_kyum_backup_enterprise(jsonb, uuid)`

Keeping the legacy RPC deployed creates two competing restore paths and risks
calling an obsolete ten-table restore implementation.

## Implemented

- Assert that all canonical Phase 17.3 functions exist before cleanup.
- Remove the obsolete deployed RPC:
  `restore_kyum_backup_transactional(jsonb, uuid)`.
- Re-apply service-role-only grants to all canonical backup/restore functions.
- Add canonical function documentation comments.
- Add a read-only verification script for:
  - restore-related function inventory
  - duplicate function signatures
  - duplicate trigger names
  - duplicate index definitions
  - canonical function counts and grants
- Preserve all historical migration files. Migration history must not be deleted
  or rewritten after deployment.

## Modified Files Only

- `supabase/migrations/phase17_3_c_database_canonicalization.sql`
- `supabase/verification/phase17_3_c_database_canonicalization_verification.sql`
- `PHASE17.3-C_VERIFICATION.md`

## Execution Order

1. Run:
   `supabase/migrations/phase17_3_c_database_canonicalization.sql`
2. Confirm all three canonical function rows show `PASS`.
3. Confirm `legacy_restore_removed = PASS`.
4. Run the read-only verification file.
5. Confirm the final row shows:
   `overall_result = PASS`.

## Important

This phase does not delete historical SQL migration files from GitHub.  
Only the obsolete deployed database RPC is removed.
