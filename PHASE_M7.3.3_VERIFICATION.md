# Phase M7.3.3 — Daily Operations Canonical Route Fix

## Confirmed Root Cause
The Daily Operations item was the only sidebar destination with a dedicated `pointerup`/capturing `click` interception layer. All other sidebar destinations used the shared navigation handler. On mobile, that custom interception path could consume the synthesized click without allowing the already-working hash route to execute.

The user's test proved that `#/dailyOperations` itself works correctly, so the screen, permission, data service, and route resolver were not the failing components.

## Fix
- Replaced the Daily Operations sidebar button with a native route link: `href="#/dailyOperations"`.
- Removed the dedicated pointer/click interception code for this item.
- Kept Daily Operations excluded from the generic sidebar click interceptor so the browser performs the hash navigation directly.
- The existing `hashchange` listener remains the single canonical path that calls `switchView("dailyOperations")`.
- Updated permission visibility handling so anchors receive `aria-disabled` and only form controls receive the `disabled` property.
- Updated PWA cache namespace and asset query versions to M7.3.3.

## Verification
- `node --check assets/js/app.js`: PASS
- `node --check assets/js/permissions.js`: PASS
- `node --check assets/js/mobile.js`: PASS
- Daily Operations element is an anchor with `href="#/dailyOperations"`: PASS
- No dedicated Daily Operations pointer/click listener remains: PASS
- Service worker cache version updated: PASS

## Scope
No changes to Supabase, SQL, task business logic, permissions data, or desktop layouts.
