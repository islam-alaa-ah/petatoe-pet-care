# Phase M10.8.10 — Import Progress Recovery

## Root Cause

The progress element existed and the import callback was still running, but recent dialog layout changes placed all status controls inside an independently scrollable container. The progress panel was hidden before execution and, when shown, could remain outside the visible scroll position behind the preview area. It also only displayed percentage and row count, making a long batch import appear inactive.

## Changes

- Restored a persistent import progress panel for normal and password-protected override imports.
- Moved the controls viewport to the progress panel when import starts.
- Made the progress panel sticky inside its own controls area so it remains visible while the preview table scrolls.
- Added live counters for successful operations, failed rows, and remaining rows.
- Forced the completed state to 100% and zero remaining rows before showing the final Supabase result summary.
- Kept the progress panel visible until the completion summary is displayed.

## Modified Files

- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`

## Verification

- JavaScript syntax check passes.
- Progress IDs are unique and connected to the existing import callback.
- No changes were made to customer validation, duplicate detection, Supabase schema, RLS, or import business rules.
