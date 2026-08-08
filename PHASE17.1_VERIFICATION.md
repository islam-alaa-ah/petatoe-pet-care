# Phase 17.1 Verification

Modified files only:

- `supabase/functions/manage-user/index.ts`
- `supabase/functions/backup-admin/index.ts`
- `supabase/migrations/phase17_1_critical_stabilization.sql`

Deployment order:

1. Deploy `manage-user`.
2. Deploy `backup-admin`.
3. Run the SQL migration.
4. Test `create` and `reset_password` as Super Admin.
5. Test backup `export`, `validate`, and `restore`.
6. Confirm non-Super-Admin requests return HTTP 403.

The backup table scope remains unchanged in Phase 17.1 by design. Full backup coverage belongs to Phase 17.3.
