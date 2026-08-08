# Phase M8.2.3 — Daily Operations Mobile Light Mode & Gregorian Date Fix

## Scope
- Mobile only (`max-width: 767px`).
- Daily Operations screen light mode only for visual corrections.
- Gregorian calendar display on mobile.

## Root Cause
The final Liquid Glass rules in `assets/css/style.css` were not restricted to dark mode. They applied navy translucent surfaces and dark-theme text assumptions to the Daily Operations screen even when Light Mode was active. In addition, date formatting used the `ar-SA` locale without an explicit Gregorian calendar, which resulted in Hijri dates.

## Fix
- Added final, higher-specificity Light Mode mobile overrides in `assets/css/mobile.css`.
- Replaced navy data surfaces with white cards, dark text, and visible muted labels.
- Preserved all Dark Mode styles.
- Added a mobile-aware date locale using `ar-EG-u-ca-gregory`; desktop behavior remains unchanged.
- Synchronized release to v18.3.4 build 18304.

## Modified Files
- `index.html`
- `service-worker.js`
- `version.json`
- `package.json`
- `assets/css/mobile.css`
- `assets/js/app.js`
- `assets/js/pwa.js`
