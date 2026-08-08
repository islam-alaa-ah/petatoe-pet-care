# Phase M9.3 — Mobile Header Position, Compact Bottom Bar & Logout Action

## Scope
Mobile-only UI polish. No release version, business logic, API, Supabase, permissions, desktop, or tablet changes.

## Root Cause
- The approved fixed header used a 96px content height and controls positioned 24px below the safe area, leaving more top spacing than required.
- Bottom navigation normal/compact dimensions were still relatively large, while the scroll direction threshold (18px) and 90ms debounce made compacting feel delayed.
- The main mobile drawer had no direct logout action even though the existing authenticated logout handler was already available through `#logoutBtn`.

## Changes
- Reduced mobile header content height to 90px and moved controls/title 6px upward while retaining the iPhone safe area.
- Reduced normal bottom navigation height to 68px and compact height to 50px.
- Reduced item/icon dimensions proportionally.
- Increased scroll response using an 8px direction threshold and 45ms debounce.
- Added a theme-aware logout button fixed at the bottom of the mobile drawer.
- Reused the existing `#logoutBtn` handler; no duplicate logout logic was introduced.

## Modified Files
- `index.html`
- `assets/css/mobile.css`
- `assets/js/mobile.js`
- `PHASE_M9.3_VERIFICATION.md`

## Verification
- JavaScript syntax check passed.
- All new CSS is restricted to `max-width: 767px`, with the footer explicitly hidden from 768px upward.
- Existing header control positions and bottom-navigation gesture engine remain intact.
- Release version unchanged.
