# Phase 17.2-E Verification Fix

Root cause:
- The verification query ordered `app_screens` by `s.sort_order`.
- The production `app_screens` table does not contain a `sort_order` column.

Fix:
- Replaced the unsupported ordering clause with:
  `ORDER BY s.screen_key`

Scope:
- Verification SQL only.
- No production schema changes.
- No data changes.
- No need to rerun Phase 17.2-A or Phase 17.2-D migrations.

Execution:
1. Open Supabase SQL Editor.
2. Replace the previous verification script with the corrected file.
3. Run the full script.
4. Review the final summary row.

Expected final result:
- `rls_failures = 0`
- `super_admin_permission_failures = 0`
- `orphan_permission_rows = 0`
- `duplicate_permission_keys = 0`
- `overall_result = PASS`
