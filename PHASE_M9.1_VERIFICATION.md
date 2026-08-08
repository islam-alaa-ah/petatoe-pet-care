# Phase M9.1 — Sales Representatives Desktop Mobile-Control Leak Fix

## Root Cause
The Phase M9 mobile administration initializer created `.mobile-admin-toolbar` and converted administration filters into mobile sheets on every viewport. The CSS styling for those injected controls existed only inside the mobile media query, so on Desktop the raw Filter, Refresh, administration navigation, and backdrop elements appeared above the Sales Representatives screen.

## Fix
- Added an early mobile viewport guard before creating administration controls.
- Added deterministic cleanup when the viewport is Desktop or Tablet.
- Removed previously injected mobile administration toolbar, backdrop, and filter-sheet header.
- Restored original filter containers by removing mobile-only classes and inline mobile state.
- Added a defensive Desktop/Tablet CSS isolation guard.

## Scope
- `assets/js/mobile.js`
- `assets/css/mobile.css`

No Business Logic, Supabase, API, permissions, data, version, or mobile design changes.

## Verification
- JavaScript syntax check passed.
- Desktop/Tablet: no mobile Filter, Refresh, pull indicator, administration tabs, backdrop, or close control.
- Sales Representatives desktop layout remains original.
- Mobile administration toolbar continues to be created only at widths up to 767px.
