# Phase M7 — Mobile Quotations Verification

## Root Cause
The quotations screen reused a ten-column desktop table and permanently visible filters on phones. Existing quotation loading, filtering, pagination, add/edit/delete operations, permissions, and Supabase integration were already implemented in `assets/js/app.js`; the required change was isolated to the mobile presentation layer.

## Scope
- Mobile quotation cards generated from the existing table rows.
- Sticky mobile quotations toolbar.
- Search, status, and representative filters moved into a Bottom Sheet.
- Existing add quotation permission and dialog retained, with a mobile floating action button presentation.
- Existing edit and delete actions retained unchanged.
- Direct call and WhatsApp actions derived from the already rendered customer phone.
- Native share where available, with clipboard fallback.
- Print-friendly quotation summary that can be printed or saved as PDF by the device browser.
- Mobile quotation dialog and pagination layout improvements.

## Files Modified
- `index.html`
- `assets/css/mobile.css`
- `assets/js/mobile.js`
- `PHASE_M7_VERIFICATION.md`

## Explicitly Unchanged
- `assets/js/app.js`
- Supabase configuration and services
- SQL / RLS
- Authentication
- Permissions
- API and queries
- Quotation CRUD and calculations
- Desktop and tablet presentation

## Verification
- `node --check assets/js/mobile.js`: passed.
- Regression syntax check for baseline `assets/js/app.js`: passed.
- Mobile asset version references unified to `M7.0.0`.
- Phase M7 CSS is isolated under `@media (max-width: 767px)`.
- Existing quotation element IDs and `data-edit-quotation` / `data-delete-quotation` actions remain unchanged.
- Package contains modified files only, under the required root folder.
- Final visual verification with real Supabase data remains required on Android and iPhone in light and dark modes.

## GitHub Desktop Summary

### Summary
`Phase M7: optimize mobile quotations workflow`

### Description
- Convert quotation table rows into mobile cards without changing quotation logic.
- Add a mobile filter Bottom Sheet using the existing search, status, and representative controls.
- Add call, WhatsApp, native share, and print/save-PDF actions from rendered quotation data.
- Improve mobile quotation dialog, statistics, pagination, and add-action accessibility.
- Preserve Desktop, Tablet, Supabase, authentication, permissions, and business logic.
