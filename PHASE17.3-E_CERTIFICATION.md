# Phase 17.3-E — Enterprise Database Verification & Certification

## Scope

This phase is read-only certification. It does not modify schema or production
data.

## Verification Coverage

- Canonical backup manifest
- Enterprise restore dry-run validator
- Enterprise transactional restore engine
- Service-role-only function grants
- Legacy restore RPC removal
- Permission engine function
- RLS coverage
- Super Admin permission completeness
- Orphan permission rows
- Duplicate permission rows
- Duplicate public function signatures
- Duplicate trigger names
- Duplicate index definitions
- Required Phase 17.3-D indexes
- Foreign-key index coverage
- Unified certification result

## Files

- `supabase/verification/phase17_3_e_enterprise_database_certification.sql`
- `PHASE17.3-E_CERTIFICATION.md`

## Execution

Run the SQL file in Supabase SQL Editor.

The final result must show:

- `canonical_grant_failures = 0`
- `legacy_restore_failures = 0`
- `rls_failures = 0`
- `super_admin_permission_failures = 0`
- `orphan_permission_rows = 0`
- `duplicate_permission_rows = 0`
- `duplicate_function_signatures = 0`
- `duplicate_trigger_names = 0`
- `missing_required_indexes = 0`
- `overall_result = PASS`

Expected certificate:

`KYUM CRM Enterprise Database Certified — Phase 17.3`

## Notes

The detailed foreign-key index query may show optional low-volume tables that
need review even when the formal required-index certification passes. Share any
returned rows before adding further indexes.
