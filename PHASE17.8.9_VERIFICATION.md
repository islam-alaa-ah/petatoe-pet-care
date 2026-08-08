# Phase 17.8.9 — Dark Mode Surface and Contrast Recovery

## Root Cause

The typography audit correctly changed Dark Mode text to white, but several
legacy components still used fixed Light Mode backgrounds such as:

- `#fff`
- `#eff6ff`
- `#f0fdf4`
- `#fff1f2`
- `#fffbeb`

This created white-on-white controls, pale buttons, white KPI cells and
unreadable badges in multiple Dark Mode screens.

## Implemented

Dark Mode overrides were added for:

- dashboard representative-performance inner metrics
- KPI and report inner cells
- customer and follow-up tables
- customer actions
- sales representative actions
- reference-data actions
- alerts and daily operations
- neutral, success, warning and danger badges
- edit, delete, activate and warning buttons
- filters, inputs, selects and checkbox dropdowns
- table rows and inner component surfaces

## Visual Rules

- Dark Mode controls use navy surfaces and white text.
- Semantic states retain red, gold and green accents through dark translucent
  backgrounds and colored borders.
- Fixed pale Light Mode component backgrounds no longer appear in Dark Mode.
- Light Mode is not changed.

## Scope Lock

No changes to:

- Header or Sidebar
- JavaScript or Business Logic
- Supabase / SQL
- Permissions or routes
- Layout, grid, spacing or responsive rules
- Data and application behavior

## Modified Files Only

- `assets/css/style.css`
- `index.html`
- `PHASE17.8.9_VERIFICATION.md`
