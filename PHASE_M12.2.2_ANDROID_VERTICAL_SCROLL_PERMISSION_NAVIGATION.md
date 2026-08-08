# Phase M12.2.2 — Android Vertical Scroll & Permission-Aware Navigation Recovery

## Root Cause

1. Some horizontally scrollable mobile containers captured the Android gesture while declaring vertical overflow/touch behavior that prevented the browser from handing a vertical gesture back to the page.
2. Runtime body lock classes could remain after an interrupted pointer/touch sequence, Android back navigation, or an incomplete drawer/filter close.
3. Screen permission visibility hid child navigation items, but parent groups were not enforced with the native `hidden` state, ARIA state, disabled toggle state, and a post-permission synchronization event. CSS/runtime reconstruction could therefore leave an empty parent group visible.

## Changes

- Restored vertical page scrolling on Android while preserving horizontal table/tab scrolling.
- Added defensive cleanup for stale drawer and filter scroll-lock classes.
- Re-synchronized desktop sidebar groups and mobile navigation after permissions are applied.
- Parent groups are hidden when they contain zero allowed screens and remain visible when at least one allowed screen exists.
- Updated application/cache version to 18.3.7 / build 18307.

## Permission Safety

No permission values, roles, RLS policies, SQL, data scope, business logic, reports, or CRUD behavior were changed. The change only synchronizes navigation visibility with the existing `canScreen(..., "view")` result.

## Modified Files

- `assets/css/mobile.css`
- `assets/js/mobile.js`
- `assets/js/permissions.js`
- `index.html`
- `package.json`
- `version.json`
- `service-worker.js`
- `assets/js/pwa.js`
