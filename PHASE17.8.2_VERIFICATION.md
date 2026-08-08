# Phase 17.8.2 — Light / Dark Theme Architecture Fix

## Root Cause

Phase 17.8 introduced hard-coded dark surface colors inside
`#dailyOperationsView` selectors. These selectors were not limited to
`html[data-theme="dark"]`, so the same dark backgrounds, borders, text colors,
buttons and icons remained active in Light Mode.

This caused the mixed theme shown in the reported screenshot.

## Implemented

- Added complete Light Mode tokens as the default for `#dailyOperationsView`.
- Added matching Dark Mode overrides under:
  - `html[data-theme="dark"] #dailyOperationsView`
- Converted the Daily Operations surfaces to token-driven values.
- Corrected:
  - main panels
  - KPI cards
  - task rows
  - titles and secondary text
  - buttons
  - icon containers
  - task checkboxes
  - pending/completed status badges
  - progress tracks
  - hover and focus states
- Preserved the Phase 17.8.1 task-row RTL layout recovery.
- Updated CSS cache-busting to `v=17.8.2`.

## Scope Lock

No changes to:

- JavaScript
- Business Logic
- Supabase / SQL
- Permissions or routes
- Header layout
- Sidebar layout
- Grid, padding or typography sizes
- Responsive behavior
- Application data

## Modified Files Only

- `assets/css/style.css`
- `index.html`
- `PHASE17.8.2_VERIFICATION.md`
