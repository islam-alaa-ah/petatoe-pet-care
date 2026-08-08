# Phase M8.2.1 — Update Activation Fix

## Root Cause
- `version.json` and the published assets were `18.3.2`, but `assets/js/pwa.js` still declared `CURRENT_VERSION = 18.3.1`.
- After reload the app therefore detected `18.3.2` again and reopened the update prompt.
- iOS standalone PWA can also keep the active service worker controller after `registration.update()`.

## Fix
- Synchronized release to `18.3.3` / build `18303`.
- Hard-reset all KYUM caches and unregister all service workers before restart.
- Added bounded timeouts so the update button cannot remain indefinitely on “جاري التحديث”.
- Restart with release and timestamp cache-busters.

## Validation
- JavaScript syntax checked with Node.
- JSON files parsed successfully.
- All version declarations verified as `18.3.3`.
