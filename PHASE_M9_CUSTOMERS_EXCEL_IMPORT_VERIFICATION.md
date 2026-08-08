# Phase M9 — Enterprise Customers Excel Import

## Root Cause
The project already contained a partial Excel import center, but it was only exposed inside Reference Data, rendered every imported row in the preview DOM, and processed the full list as one uninterrupted row-by-row loop. Large files therefore risked UI slowdown and the primary Customers screen had no direct import entry point.

## Changes
- Added Excel import and template buttons to the main Customers screen.
- Kept the existing Supabase customer save path and permission checks.
- Limited visual preview to the first 200 rows while importing all valid rows.
- Added sequential chunk processing (200 rows per chunk) with progress tracking.
- Added failed-row Excel export.
- Added progress bar, percentage, and processed row counts.
- No database, SQL, API, permission, desktop/mobile navigation, or release version changes.

## Verification
- JavaScript syntax checks: passed.
- Required customer fields and duplicate validation remain active.
- Main screen and Reference Data use the same import dialog.
- Large files no longer create an unbounded preview table.
- All valid rows are processed; preview cap does not cap import count.
