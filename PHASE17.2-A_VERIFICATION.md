# Phase 17.2-A — Permission Source of Truth

Modified files only:

- assets/js/permissions.js
- assets/js/permissions-service.js
- assets/js/auth-session.js
- assets/js/app.js
- supabase/migrations/phase17_2_enterprise_permissions_source_of_truth.sql

Implemented:
- Fail-closed permission loading.
- One in-memory permission map from role_screen_permissions.
- Route guard inside switchView().
- Automatic fallback to the first allowed screen.
- Hidden and disabled unauthorized navigation items.
- Permission state reset on logout.
- Canonical PostgreSQL has_screen_permission(screen, action) helper.
- Super Admin permission-row reconciliation.

Verification completed:
- node --check passed for all modified JavaScript files.
