# Phase 17.8.4 — Light Mode Text Clarity Fix

## Root Cause

The Light Mode surfaces were corrected in Phase 17.8.2, but several labels,
descriptions, dates and buttons still inherited low-contrast muted colors and
legacy opacity rules. Disabled buttons were particularly washed out.

## Implemented

- Strengthened Light Mode primary, secondary and muted text tokens.
- Forced full opacity for:
  - headings
  - KPI values
  - card descriptions
  - dates
  - task titles and descriptions
  - table labels
  - alert text
- Improved disabled-button readability without enabling the controls.
- Improved alert action-button text clarity.
- Preserved semantic red/green status colors.
- Slightly improved Dark Mode secondary text contrast.
- Updated CSS cache-busting to `v=17.8.4`.

## Scope Lock

No changes to:

- Layout or spacing
- Checkbox behavior
- JavaScript or Business Logic
- Supabase / SQL
- Permissions or routes
- Header or Sidebar
- Responsive behavior
- Application data

## Modified Files Only

- `assets/css/style.css`
- `index.html`
- `PHASE17.8.4_VERIFICATION.md`
