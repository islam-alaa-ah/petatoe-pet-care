# Phase 17.4-B.2 — Activity Log Relationship Fix

## Confirmed Root Cause

The Activity Log service used an ambiguous PostgREST embed:

`user:user_profiles(full_name,email)`

The `audit_logs.user_id` column has valid relationships to:

- `auth.users(id)`
- `public.user_profiles(id)`

PostgREST therefore required the intended public relationship to be named
explicitly.

## Fix

The Activity Log query now uses:

`user:user_profiles!audit_logs_user_profile_fkey(full_name,email)`

This matches the canonical relationship retained in Phase 17.4-B.1.

## Modified Files Only

- `assets/js/activity-service.js`
- `PHASE17.4-B.2_VERIFICATION.md`

## Verification

1. Copy the modified file into the project.
2. Commit and push to GitHub.
3. Hard refresh the application.
4. Open **سجل النشاط**.
5. Expected:
   - no relationship ambiguity error
   - activity rows load normally
   - Network request for `audit_logs` returns HTTP 200

No database migration is required.
