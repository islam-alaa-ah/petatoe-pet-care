# Phase M13.7.2 — Offline Authentication Bootstrap

## Root Cause

The application shell was cached, but the Supabase browser SDK was loaded from a CDN that was excluded from the service worker cache strategy. While offline, `window.supabase` was therefore missing and `window.customerSupabase` could not be created.

Even when an auth session existed in local storage, activation still required two direct network reads:

- `user_profiles`
- `role_screen_permissions`

This caused the login screen to remain visible with `Failed to fetch`, or a JavaScript error while evaluating `window.customerSupabase.auth`.

## Fix

- Cache the Supabase browser SDK after any successful online load.
- Keep service worker installation successful if the CDN is temporarily unavailable.
- Load Smart Cache before auth initialization.
- Cache the active user profile after successful online authentication.
- Cache the user's role permissions after successful online authentication.
- Restore the saved session, profile and permissions when offline.
- Prevent a new password sign-in attempt while offline and show a clear message instead.

## Offline Security Boundary

Offline access is allowed only when all of the following already exist on the same device:

1. A valid persisted Supabase session.
2. A previously cached active user profile.
3. Previously cached role permissions for non-super-admin users.

The first login, a login after session removal, or a login after local storage/cache clearing still requires internet access.

## Files Modified

- `index.html`
- `service-worker.js`
- `assets/js/auth-session.js`
- `assets/js/permissions-service.js`
- `assets/js/pwa.js`
- `package.json`
- `version.json`

## Version

- Version: `18.5.3`
- Build: `18503`
- Cache: `kyum-crm-pwa-18-5-3-m13-7-2`
