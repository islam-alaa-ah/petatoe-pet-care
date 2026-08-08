# Phase 12 Setup

## 1. Run SQL

Run:

`supabase/migrations/phase12_backup_system_settings.sql`

inside the Kyum Trading Company Supabase SQL Editor.

## 2. Deploy Edge Function

Deploy:

`supabase/functions/backup-admin`

with the function name:

`backup-admin`

The function uses the server-side environment variables already provided by Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Never copy the Service Role key into GitHub or browser code.

## 3. Test

1. Open Settings & Privacy → Backups.
2. Export a backup and confirm a JSON file downloads.
3. Select that JSON file and confirm the table counts appear.
4. Test restore only after creating a fresh backup.
5. Open System Settings, update the company data, save, and refresh.
