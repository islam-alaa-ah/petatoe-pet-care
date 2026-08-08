# Phase M12.5.3 — Action Authorization Integration

## Root Cause
Action visibility and authorization were split between role-based helper functions, legacy CSS classes, and isolated screen checks. This could make a button visible even when the current screen permission denied the corresponding action.

## Changes
- Added centralized action bindings and authorization to `PermissionEngine`.
- Added capture-phase protection for permission-tagged actions before their existing handlers execute.
- Unified customer, follow-up, quotation, import, export, user, permission, backup, and system-setting action visibility.
- Migrated core `app.js` authorization helpers to use `PermissionEngine` with the legacy engine retained as fallback.
- Kept import mapped to the existing `can_add` permission because the current database schema has no separate `can_import` field.

## Safety
No SQL, RLS, schema, data scope, service queries, or business calculations were changed.

## Version
- Version: 18.3.10
- Build: 18310
- Cache: kyum-crm-pwa-18-3-10-m12-5-3
