# Phase M8.3.6 — Desktop Regression Isolation Fix

## Root Cause
Mobile-only dashboard and customer filter controls were being inserted by `assets/js/mobile.js` even when the viewport was Desktop/Tablet. Their CSS definitions existed only inside the mobile media query, so on Desktop the injected toolbar, close buttons, and backdrop fell back to raw browser layout and altered the customer filters and dashboard layout.

## Fix
- Added an explicit Desktop/Tablet isolation guard that hides all mobile-only dashboard/customer filter controls outside the mobile media query.
- Prevented `installDashboardShell()` and `installCustomersShell()` from running unless `(max-width: 767px)` matches.
- Limited authentication-time mobile shell setup and dashboard refresh to mobile viewports.
- Added controlled setup when entering mobile width and cleanup when leaving it.

## Scope
Modified only:
- `assets/css/mobile.css`
- `assets/js/mobile.js`

No changes to Business Logic, Supabase, APIs, permissions, Desktop feature logic, Tablet feature logic, or release version.

## Verification
- JavaScript syntax: passed (`node --check assets/js/mobile.js`).
- Desktop dashboard mobile toolbar is not inserted on a desktop load and is hidden defensively if left in the DOM after resizing.
- Desktop customer filters retain exactly three normal select controls; mobile close/backdrop/filter controls cannot participate in desktop layout.
- Mobile behavior remains available when viewport width is 767px or less.
