# Phase 17.2-E — Enterprise Permissions Verification

This package contains verification files only. It does not modify application runtime code or production data.

## Files

- `supabase/verification/phase17_2_e_permissions_verification.sql`
- `tests/phase17_2_e_browser_smoke_test.js`

## Database verification

Run the SQL file in Supabase SQL Editor after Phase 17.2-D.

Expected final summary:

- `rls_failures = 0`
- `super_admin_permission_failures = 0`
- `orphan_permission_rows = 0`
- `duplicate_permission_keys = 0`
- `overall_result = PASS`

The query that detects broad authenticated policies should return no unsafe policy rows. Review any returned row before approval.

## Browser verification

1. Sign in to KYUM CRM.
2. Open DevTools with `F12`.
3. Open Console.
4. Paste the contents of `tests/phase17_2_e_browser_smoke_test.js`.
5. Press Enter.

Expected result:

`Phase 17.2-E browser smoke test: PASS`

Run the browser test using at least:

- Super Admin
- Admin
- Auditor
- Viewer
- A role with at least one denied screen

## Manual matrix

For each role verify:

- Unauthorized screen does not appear in navigation.
- Direct route invocation cannot open an unauthorized screen.
- Add/Edit/Delete/Export buttons match the permission matrix.
- Direct service calls are rejected when the action is denied.
- Changing permissions and refreshing applies the new matrix.
- Disabled users cannot enter the application.
