# Phase M10.1 — User Creation Edge Function Fix

## Root Cause

The deployed `manage-user` Edge Function and the application role model were out of sync.

The web application sends these role values:

- `super_admin`
- `sales_manager`
- `sales_supervisor`
- `sales_representative`
- `customer_service`
- `viewer`

The Edge Function accepted legacy/non-project values (`admin`, `auditor`) and rejected valid KYUM roles such as `sales_manager`, `sales_representative`, and `customer_service` with a non-2xx response.

The function also ignored these values sent by the Add User form:

- linked sales representative
- must-change-password flag
- data access mode
- additional allowed representatives

The browser displayed only the generic Supabase message `Edge Function returned a non-2xx status code`, hiding the actual response body and error code.

## Fix

- Aligned the Edge Function role whitelist with `CustomerPermissions.roleOptions`.
- Persisted the complete user profile during account creation.
- Persisted the Phase M10 data access scope inside the server-side creation flow.
- Added rollback of the Auth user and profile if profile or data-scope persistence fails.
- Removed the second client-side data-scope save after account creation.
- Added parsing of the Edge Function response body so future errors display the real code and message.
- Reused the same detailed error handling for password reset.

## Deployment Required

After copying the modified files to the repository, redeploy the function:

```bash
supabase functions deploy manage-user
```

The Phase M10 migration must already be applied before testing:

```text
supabase/migrations/phase_m10_enterprise_roles_user_data_scope.sql
```

## Verification

- `node --check assets/js/users-service.js`: passed.
- KYUM role values in the web client and Edge Function are aligned.
- User profile payload includes email, role, representative, active status, and password-change flag.
- Data access profile and selected representatives are created in the same server-side operation.
- Rollback paths exist for profile and data-scope failures.
- No database schema, RLS, UI layout, permissions matrix, or release-version changes were made.

## Runtime Test Checklist

1. Deploy `manage-user`.
2. Sign in as an active `super_admin`.
3. Create one user for each required role.
4. Confirm the new user appears after refresh.
5. Confirm representative link, active state, password-change flag, and data scope persist.
6. Try a duplicate email and verify the UI shows `USER_ALREADY_EXISTS` instead of the generic non-2xx message.
