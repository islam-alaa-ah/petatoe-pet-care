# Phase 17.3-B — Enterprise Restore Engine

## Root cause addressed

The previous restore implementation was limited to ten hard-coded tables and had three competing definitions of `restore_kyum_backup_transactional`. It could not restore the Phase 17.3-A format 2.0 manifest, did not provide an independent dry run, and could not produce a complete restore report.

## Modified files

- `supabase/functions/backup-admin/index.ts`
- `supabase/migrations/phase17_3_b_enterprise_restore_engine.sql`
- `assets/js/backup-service.js`

## Implemented

- Read-only dry-run RPC: `kyum_validate_backup_restore`.
- Transactional restore RPC: `restore_kyum_backup_enterprise`.
- Backup format 2.0 validation before restore.
- SHA-256 integrity verification before database changes.
- Required-table and target-table checks.
- Supabase Auth / `user_profiles` referential check.
- Reverse-order deletion and forward-order insertion using the canonical manifest.
- Generated-column exclusion and identity-value restoration.
- Serial/identity sequence realignment.
- Automatic PostgreSQL rollback when any table fails.
- Audit history preservation for `audit_logs` and `backup_operations`.
- Started/completed/failed restore operation logging.
- Browser service support for explicit dry-run requests.

## Verification performed

- `node --check assets/js/backup-service.js`: passed.
- TypeScript parsing/bundling with esbuild: passed.
- PostgreSQL migration parsing with pglast: passed.

## Deployment order

1. Run `supabase/migrations/phase17_3_b_enterprise_restore_engine.sql` in Supabase SQL Editor.
2. Confirm both verification rows show:
   - `security_definer = true`
   - `anon_can_execute = false`
   - `authenticated_can_execute = false`
   - `service_role_can_execute = true`
3. Deploy `backup-admin`:
   - `npx supabase functions deploy backup-admin`
4. Push the frontend service file to GitHub.
5. Create a fresh Phase 17.3-A backup.
6. Validate it.
7. Run a dry run before any production restore.

## Production safety

Do not run the actual restore merely as a test on Production. First use `restore_dry_run`, review `errors` and `warnings`, and keep a separate current export.
