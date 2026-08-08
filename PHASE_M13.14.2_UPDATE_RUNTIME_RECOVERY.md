# Phase M13.14.2 — Update Runtime Recovery

## Root Cause
The previous hotfix unified version numbers but the HTML still loaded `app.js`, `mobile.js`, and `pwa.js` with the old fixed query `v=18.10.0`. The service worker also matched static assets with `ignoreSearch: true`. Therefore a browser could receive the new `version.json` while continuing to execute an older cached `pwa.js`, causing the forced update dialog to reopen after every refresh.

## Fix
- Versioned critical runtime script URLs in `index.html` with `18.12.2`.
- Registered the service worker through a versioned script URL.
- Stopped ignoring query strings for versioned static asset requests.
- Added expected-release reconciliation and automatic stale-runtime recovery.
- Cleared completed update markers after the new runtime is active.

## Scope
No business logic, Supabase, permissions, Offline Queue, or Smart Sync behavior was changed.
