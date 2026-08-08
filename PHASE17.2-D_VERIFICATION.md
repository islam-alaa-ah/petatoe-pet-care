# Phase 17.2-D — Database / RLS Alignment

Modified files only:

- `supabase/migrations/phase17_2_d_rls_alignment.sql`

Implemented:

- Replaced broad authenticated CRUD policies on customers, follow-ups and quotations.
- Enforced the canonical `has_screen_permission(screen, action)` helper at database level.
- Preserved row ownership/scoping for sales representatives.
- Aligned reference-data CRUD with screen action permissions.
- Aligned user profiles, permissions matrix, activity log, system settings and backup history.
- Kept `app_screens` readable to authenticated users because it is required to build the permitted menu.
- Kept backup export/restore behind the secured Edge Function; direct table access is read-only by permission.

Deployment:

1. Run the migration in Supabase SQL Editor as `postgres`.
2. Confirm the policy result list is returned.
3. Confirm every listed table reports `rls_enabled = true`.
4. Test with Super Admin, Viewer and Sales Representative accounts.

Rollback note:

This migration replaces existing policies but does not alter table data or columns.
