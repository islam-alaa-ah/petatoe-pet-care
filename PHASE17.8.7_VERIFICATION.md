# Phase 17.8.7 — Global Secondary Text Clarity

## Root Cause

Secondary labels and descriptions across the project were still using small
font sizes and mixed muted colors from legacy component rules. This made KPI
labels, card descriptions, dates, captions and helper text difficult to read.

## Implemented

- Applied the secondary typography update across all program screens.
- Light Mode:
  - secondary text uses black (`#111827`)
- Dark Mode:
  - secondary text uses white (`#FFFFFF`)
- Increased:
  - standard secondary text to at least 14px
  - small labels to at least 13px
  - table captions to 12px
- Applied to:
  - cards
  - KPI labels
  - descriptions
  - dates and times
  - tables
  - forms and placeholders
  - dialogs and modals
  - dropdown panels
  - tooltips
  - empty states
  - Daily Operations labels
- Preserved semantic badge and status colors.
- Preserved the approved green checkbox and white check mark.
- Explicitly excluded Header and Sidebar.

## Scope Lock

No changes to:

- Header design or layout
- Sidebar or navigation
- JavaScript or Business Logic
- Supabase / SQL
- Permissions or routes
- Responsive layout
- Grid, spacing or padding
- Cards, borders, shadows or glass
- Hover, transition or animation

## Modified Files Only

- `assets/css/style.css`
- `PHASE17.8.7_VERIFICATION.md`
