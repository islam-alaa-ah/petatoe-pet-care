# Phase M13.14.1 — Update Dialog Hotfix

## Root Cause
`version.json` was updated to `18.12.0`, while `assets/js/pwa.js` still declared `CURRENT_VERSION = "18.11.0"`.
Because `forceUpdate` is enabled, every refresh detected `18.12.0` as newer and reopened the mandatory update dialog.

## Fix
- Unified runtime and manifest version at `18.12.1`.
- Updated Service Worker cache key.
- No UI, Business Logic, Supabase, Offline Queue, or Sync behavior changed.

## Modified Files
- assets/js/pwa.js
- version.json
- service-worker.js
