# P5.13.8.61 — Update Runtime Reload Loop Hotfix

## Root Cause
P5.13.8.60 advanced `version.json` and the Service Worker cache to `18.55.78`, but `assets/js/pwa.js` still declared `CURRENT_VERSION = 18.55.77` and `index.html` still loaded `pwa.js?v=18.55.77`.

The canonical update runtime therefore continuously considered the already-installed application to be one release behind. Its normal update checks kept rediscovering `18.55.78`, which could repeatedly activate the update/restart flow and return the user to the session verification bootstrap screen.

## Fix
- Aligned the canonical PWA runtime version with the released application version.
- Bumped the hotfix release to `18.55.79` / build `185579`.
- Updated the PWA script cache-buster in `index.html`.
- Updated the Service Worker cache token to the same release.
- No changes to session/auth logic, navigation logic, business logic, database, Supabase, RLS, permissions, or screen behavior.

## Modified Files
- `index.html`
- `assets/js/pwa.js`
- `version.json`
- `service-worker.js`

## Verification
- `node --check assets/js/pwa.js` — PASS
- `node --check service-worker.js` — PASS
- Existing `app.js` syntax — PASS
- Localization lockdown — PASS
- Version alignment check (`version.json` = `pwa.js CURRENT_VERSION` = `index pwa query`) — PASS
- Service Worker cache token aligned to `18.55.79` — PASS

## SQL
None.

## Manual Verification
1. Open/update the application once and allow the new Service Worker to activate.
2. Confirm the session verification screen completes normally and the application does not restart every second.
3. Navigate across several screens and confirm there is no repeated refresh/reload.
4. Confirm the desktop back button from P5.13.8.60 still works normally.
5. Confirm update notifications still wait for a safe navigation/reload point and do not interrupt an active action.

## GitHub Desktop Summary
Fix PWA version mismatch causing repeated update/reload loop after P5.13.8.60.
