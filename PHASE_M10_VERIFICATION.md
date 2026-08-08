# Phase M10 — Enterprise Roles & User Data Scope

## Root Cause

1. Role permissions were stored in `role_screen_permissions`, but the UI accepted the success response without re-reading and comparing the saved matrix. A successful request therefore did not prove that every checkbox had persisted.
2. Data visibility was hard-coded in RLS as either management/all, viewer/all, or the current representative only. There was no persisted per-user scope for allowing one representative to see selected additional representatives.
3. User management stored only one `representative_id`; it had no separate concept for "what this user may do" versus "whose records this user may access".

## Implemented

- Added verified role-permission saves: after upsert, the matrix is reloaded and compared field by field before success is displayed.
- Added persisted user data scopes: `own`, `selected`, and `all`.
- Added a selected-representatives mapping table.
- Added user-dialog controls and a user-list scope summary.
- Applied the scope in Supabase RLS for customers, customer interests, follow-ups, quotations, customer contacts, CRM tasks, and representative-based daily-operation reads.
- Preserved existing users by seeding safe defaults matching their current behavior.
- Added immediate permission reload when the currently logged-in role is edited.

## Verification Performed

- `node --check assets/js/app.js`: passed.
- `node --check assets/js/users-service.js`: passed.
- `node --check assets/js/permissions-service.js`: passed.
- Confirmed all new HTML IDs are referenced by JavaScript.
- Confirmed ZIP contains modified files only under original repository paths.

## Supabase Required Step

Run once:

`supabase/migrations/phase_m10_enterprise_roles_user_data_scope.sql`

Then optionally run:

`supabase/verification/phase_m10_roles_data_scope_verification.sql`

## Functional Test Matrix

1. Set a representative user to `own`; confirm only linked representative records are returned.
2. Set another user to `selected`, choose an additional representative; confirm both own and selected records are returned.
3. Set a manager to `all`; confirm all records are returned.
4. Remove a role's quotation `view` permission; confirm the screen and database rows are inaccessible after re-login/reload.
5. Restore the permission; save and confirm the persisted matrix reloads identically.
