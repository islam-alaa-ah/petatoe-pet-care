# Phase 17.3-A — Enterprise Backup Architecture

## Modified files

- `supabase/functions/backup-admin/index.ts`
- `supabase/migrations/phase17_3_a_enterprise_backup_architecture.sql`

## Implemented

- Canonical database-backed backup table manifest.
- Coverage of all 31 known KYUM CRM tables when present.
- Safe handling of optional modules that are not installed.
- Pagination beyond Supabase's default 1,000-row response limit.
- Per-table SHA-256 checksums.
- Whole-payload SHA-256 checksum.
- Backup format version `2.0`.
- Schema version metadata.
- Safe Auth user directory export without password hashes.
- Detailed backup operation metadata.
- Full structural and checksum validation.
- Enterprise restore intentionally disabled until Phase 17.3-B.

## Deployment order

1. Copy the modified files into the project.
2. Commit and push to GitHub.
3. Run `phase17_3_a_enterprise_backup_architecture.sql` in Supabase SQL Editor.
4. Confirm:
   - `anon_can_execute = false`
   - `authenticated_can_execute = false`
   - `service_role_can_execute = true`
5. Deploy:
   - `npx supabase functions deploy backup-admin`
6. Run Export Backup.
7. Run Validate Backup against the exported JSON.

## Expected validation

- `success = true`
- `valid = true`
- `errors = []`
- `format_version = 2.0`

## Important

Do not test Restore yet. Phase 17.3-A intentionally returns:

`RESTORE_REQUIRES_PHASE_17_3_B`
