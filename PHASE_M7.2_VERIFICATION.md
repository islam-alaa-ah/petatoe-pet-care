# Phase M7.2 — Mobile Layout & Navigation Stabilization

## Baseline
`kyum.company-main (4)(2).zip`

## Root causes addressed
1. The mobile header used content-width negative margins and a short minimum height, so the light page background remained visible around the header on iPhone/PWA safe-area layouts.
2. Several desktop-oriented report tables retained large fixed minimum widths without a viewport-contained scrolling wrapper.
3. Customer and permissions layouts needed stricter mobile width constraints and compact action/grid rules.
4. Daily Operations navigation relied only on the initial direct click bindings; a delegated capture fallback was added for the root sidebar item.

## Modified files
- `assets/css/mobile.css`
- `assets/js/app.js`

## Verification performed
- JavaScript syntax: `node --check assets/js/app.js` — passed.
- JavaScript syntax: `node --check assets/js/mobile.js` — passed.
- Delivery contains modified files only, preserving original repository paths.

## Scope protection
- No Supabase, SQL, business logic, calculations, or desktop-specific styles were changed.
