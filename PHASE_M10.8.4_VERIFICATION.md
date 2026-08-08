# Phase M10.8.4 — Super Admin Password-Protected Import Override

## Scope
- Adds a Super Admin-only exceptional import action.
- Requires verification of the current Super Admin password through a Supabase Edge Function.
- Never imports rows marked as duplicate, previously uploaded, or already registered.
- Only validation warnings that are safe to bypass are included; hard reference/required-field failures stay rejected.
- Records every approved override in `admin_import_overrides` without storing the password.

## Deployment order
1. Run `supabase/migrations/phase_m10_8_4_admin_import_override.sql`.
2. Deploy `supabase/functions/verify-admin-import-override`.
3. Upload the modified frontend files.
4. Run the verification SQL.

## Verification
- Normal users do not see the override button.
- Super Admin sees it only when override-eligible rows exist.
- Wrong password is rejected.
- Duplicate rows remain excluded.
- Successful verification starts import and records an audit row.
