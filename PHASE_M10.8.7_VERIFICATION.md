# Phase M10.8.7 — Import Dialog Recovery & Action Guard

## Root Cause
- Import status, progress, and summary elements were direct grid children while the existing CSS expected a `.customer-import-controls` wrapper. This caused the blue status message to overlap the summary counters.
- The Super Admin override button was hidden whenever no soft-error rows were eligible, making the feature appear missing even when the current rows were duplicates or already uploaded.
- The normal import button could remain visually active with zero importable rows, while the handler returned without a visible explanation.

## Changes
- Added the missing isolated controls container and a dedicated decision notice.
- Reserved independent layout space for status, progress, summary, import mode, and final result.
- Kept the Super Admin override control visible for Super Admin accounts; it becomes disabled with an explanatory label when no eligible rows exist.
- Added exact importable-row counts to the action labels.
- Added a hard action guard and visible message when no rows can be sent to Supabase.
- Preserved exclusion of duplicates and previously uploaded rows from normal and exceptional imports.

## Modified Files
- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`

## Verification
- `node --check assets/js/app.js`
- Confirm the blue status block no longer overlaps summary counters.
- With zero new rows, the normal import button is disabled and explains why.
- Super Admin sees the override button; it is enabled only when eligible soft-error rows exist.
- Existing and duplicate rows are never included in either import path.
