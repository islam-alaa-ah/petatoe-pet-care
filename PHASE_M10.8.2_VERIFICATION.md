# Phase M10.8.2 — Failed Rows Export

## Scope
Customer Excel import dialog only.

## Root Cause
The existing export button was populated and shown only after the import execution completed. Validation errors detected during preview were not assigned to the export collection, so users could see the error count but could not download the affected rows before importing.

## Changes
- Populate failed-row export data immediately after preview validation.
- Show the export button whenever preview errors exist.
- Display the validation error count in the button label.
- Preserve the button after import if runtime failures are added.
- Export the original customer columns together with source row and error reason.
- Do not alter import eligibility or database logic.

## Modified Files
- index.html
- assets/js/app.js
- assets/js/customer-excel-center.js

## Verification
- `node --check assets/js/app.js` passed.
- `node --check assets/js/customer-excel-center.js` passed.
- Rows with validation errors remain excluded from `validRows`.
- Export is available before clicking the import execution button.
