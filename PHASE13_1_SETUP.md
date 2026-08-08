# KYUM Phase 13.1 — Critical Backup Fix Setup

## Root cause fixed

The previous restore implementation deleted and inserted tables through multiple REST calls. A failure in the middle could leave the database partially restored.

The new implementation performs all deletes and inserts inside one PostgreSQL function call. PostgreSQL automatically rolls back every change if any statement fails.

## Installation order

1. Run in Supabase SQL Editor:

   `supabase/migrations/phase13_1_transactional_backup_restore.sql`

2. Redeploy the Edge Function from:

   `supabase/functions/backup-admin/index.ts`

   Function name:

   `backup-admin`

3. Keep **Verify JWT** enabled for the function.

## Safe test procedure

1. Create and download a fresh backup.
2. Keep the downloaded file outside the project folder.
3. Add one temporary test customer.
4. Validate the backup file in Backup Center.
5. Restore it using the confirmation phrase `RESTORE KYUM DATA`.
6. Confirm the temporary test customer disappears and the original counts return.
7. Check `backup_operations`: the restore must show `completed` and `restore_mode = transactional_rpc`.

Do not test restore against live business data until export and validation have succeeded.
