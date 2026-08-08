# Phase M8.2.3.1 — Light Menu Regression Fix

## Root Cause
Phase M8.2.3 was prepared from a baseline that did not include the final M8.2.2 mobile Light Mode menu block. As a result, the Daily Operations fixes remained, but the approved sidebar contrast rules were absent from `assets/css/mobile.css`.

## Fix
- Restored the exact M8.2.2 Light Mode mobile sidebar rules.
- Preserved the M8.2.3 Daily Operations Light Mode selectors and Gregorian mobile date formatting.
- Kept both changes isolated by screen selectors (`#mainSidebar` and `#dailyOperationsView`).
- Synchronized release to v18.3.5 build 18305.

## Modified Files
- `assets/css/mobile.css`
- `index.html`
- `service-worker.js`
- `version.json`
- `package.json`
- `assets/js/pwa.js`
