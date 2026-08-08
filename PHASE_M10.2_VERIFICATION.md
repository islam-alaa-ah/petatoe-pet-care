# Phase M10.2 — User List Relationship Fix

## Root Cause
PostgREST found more than one relationship path between `user_profiles` and `sales_representatives`. The users query embedded `sales_representatives` without naming the intended foreign key, so the users list failed to load.

## Fix
The user-profile representative embed now explicitly uses:

`user_profiles_representative_id_fkey`

## Verification
- `node --check assets/js/users-service.js`: passed.
- Only the users-list relationship selector was changed.
- No database, RLS, permissions, business logic, or release-version changes.
