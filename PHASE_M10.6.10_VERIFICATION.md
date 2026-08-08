# Phase M10.6.10 — Customer Import Preview Filter & Controls Visibility

## Scope
- Added a preview-row filter to the customer Excel import dialog.
- Kept the import mode and preview filter visible above the preview table during file processing.
- Preserved the fixed footer and existing import business logic.

## Preview filters
- All rows
- Error rows only
- Valid rows only
- New customers
- Existing customers
- Additional requests or quotations
- Duplicate rows only

## Verification
- The filter changes only the preview; import execution continues to use all valid rows.
- Empty filtered results display a clear message.
- The controls area scrolls independently and no longer drops behind the preview table.
- The table and action footer remain independently scrollable/fixed.
- No Supabase, SQL, validation, or import persistence logic was changed.
