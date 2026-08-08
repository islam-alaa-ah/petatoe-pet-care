# Phase M9.4.3 — Representatives Import Modal Layout Stabilization

## Scope
- Sales Representatives Excel import dialog only.
- No JavaScript, validation, import, Supabase, permissions, routing, or version changes.

## Root Cause
The dialog shell used one shared scroll container. The preview table and action buttons therefore moved in the same scrolling flow, causing the Import and Cancel buttons to float over preview rows. Horizontal overflow also belonged to the whole dialog instead of the table area.

## Fix
- Converted the representatives import dialog shell to a fixed grid layout.
- Kept header, upload controls, status, progress, summary, and footer outside the scrolling region.
- Limited vertical and horizontal scrolling to the preview table container.
- Added a stable footer for Cancel, Import, and failed-row export actions.
- Added a sticky preview-table header.
- Added dedicated Light and Dark mode surfaces.

## Verification
- Action buttons remain fixed below the preview and never overlap rows.
- Preview rows scroll independently.
- Horizontal scrolling is contained inside the preview table.
- Existing import IDs and JavaScript hooks remain unchanged.
- Mobile and desktop viewport constraints are preserved.
