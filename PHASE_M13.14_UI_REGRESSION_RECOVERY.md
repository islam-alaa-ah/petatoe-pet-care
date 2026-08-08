# Phase M13.14 — UI Regression Recovery

## Baseline
`kyum.company-main (10).zip`

## Root Cause
- Mobile toolbars and filter sheets remained in the DOM after responsive transitions, allowing mobile presentation elements to leak into desktop layouts.
- The mobile customers action row used an auto-column grid while the import action group contained three controls, so the search field could be visually covered or displaced.
- The quotations floating action and pagination reserved insufficient space above the compact bottom navigation.
- Three previously removed explanatory strings had returned in `index.html`.

## Files Modified
- `index.html`
- `assets/css/mobile.css`
- `version.json`
- `service-worker.js`

## Scope
UI layout and visible text only. No database, Supabase, permissions, Smart Cache, Offline Queue, Sync Engine, or business logic changes.
