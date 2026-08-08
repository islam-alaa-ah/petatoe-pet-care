# Phase 11 Setup

1. Run `supabase/migrations/phase11_users_permissions.sql`.
2. Deploy `supabase/functions/manage-user` as an Edge Function named `manage-user`.
3. Do not place the Service Role key in GitHub or browser files.
4. Test creating a user, editing a role, resetting a temporary password, and changing role permissions.
