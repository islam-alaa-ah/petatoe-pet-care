# Phase M13.8 — Offline Runtime Reliability Foundation

## Baseline
- Source: `kyum.company-main (7)(2).zip`
- Previous version: `18.5.5` / Build `18505`

## Root causes corrected
1. App Shell stored unversioned paths while `index.html` requested versioned URLs, so exact Cache API matching could miss valid cached files.
2. `daily-suggestions-service.js`, `representative-excel-center.js`, and `native.js` were loaded by the application but absent from the Service Worker App Shell.
3. Supabase JS, XLSX, and html2canvas were cross-origin dependencies without a dedicated Service Worker caching strategy.
4. `cache.addAll()` made Service Worker installation all-or-nothing; one unavailable optional file could invalidate the entire offline runtime.
5. CSS and JavaScript files used multiple historical version tokens, producing fragmented runtime cache entries.

## Implementation
- Added query-insensitive cache matching for same-origin static assets.
- Split App Shell into required core and optional assets.
- Cached each asset independently with explicit core failure reporting.
- Added a dedicated vendor cache for approved CDN scripts and fonts.
- Added all local CSS and JavaScript files loaded by `index.html` to the App Shell inventory.
- Unified local CSS/JS version tokens at `18.6.0`.
- Added a permanent runtime reliability certification command:
  - `npm run offline:runtime:check`

## Runtime policy
- Navigation: network first, cached page fallback, then cached `index.html`, then `offline.html`.
- Same-origin static assets: cache first with background refresh and query-string normalization.
- Approved vendor scripts/styles/fonts: vendor cache first, then network and cache.
- Supabase API/Auth/Functions requests: never cached by the Service Worker.
- `version.json`: network/no-store with cached metadata fallback only when offline.

## Release
- Version: `18.6.0`
- Build: `18600`
- Service Worker cache: `kyum-crm-pwa-18-6-0-m13-8`
