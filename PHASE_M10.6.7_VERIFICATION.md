# Phase M10.6.7 — Customer Import Modal Fixed Footer

## Root Cause
The customer import dialog used a single scrollable `.dialog-shell` (`overflow: auto`). Consequently, the footer action row was part of the scrolling content and moved vertically/horizontally with the preview table.

## Scope
CSS-only isolated adjustment for `#customerImportDialog` through `.customer-import-dialog:not(.representative-import-dialog)`.

## Changes
- Converted the dialog shell to a fixed-height grid layout.
- Restricted scrolling to the preview table container only.
- Kept the dialog header, upload controls, summary, options, and footer outside the scrolling region.
- Fixed the Cancel, Import, and failed-rows export actions at the bottom of the dialog.
- Added a sticky preview table header.
- Preserved horizontal scrolling inside the table without moving the footer.
- Added responsive mobile sizing and wrapping.
- Preserved light and dark theme surfaces.

## Not Changed
- Import parsing or validation.
- Customer create/update logic.
- JavaScript event handlers.
- Supabase, SQL, RLS, or permissions.
- Representative import dialog.
