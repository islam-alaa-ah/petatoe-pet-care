# Phase M7.2.1 — Corrective Mobile Hotfix

## Root causes corrected
- The mobile header still inherited conflicting margins/padding from multiple historical mobile breakpoints, leaving the iPhone safe/status area painted by the page background.
- The previous table fix preserved desktop-width tables with horizontal scrolling instead of converting the affected daily-task matrix to a true mobile card layout.
- Daily Operations navigation depended on the original click binding and could be lost/intercepted by the off-canvas mobile sidebar lifecycle.
- Existing asset query versions were unchanged, allowing an installed PWA/browser cache to continue serving old CSS/JS.

## Files changed
- index.html
- assets/css/mobile.css
- assets/js/app.js
- assets/js/mobile.js

## Static verification
- node --check assets/js/app.js: PASS
- node --check assets/js/mobile.js: PASS
- Asset versions updated to M7.2.1.
