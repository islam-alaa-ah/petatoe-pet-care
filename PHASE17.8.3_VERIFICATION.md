# Phase 17.8.3 — Checkbox State and Theme Contrast Fix

## Root Cause

The original completed checkbox rule used a green background, but the later
theme rule applied:

`background: var(--kyum-surface-1) !important`

to `.daily-task-check`.

Because the newer rule used `!important`, it overrode the old green completed
state. This left only a white check mark inside a neutral square.

The Light/Dark palette also used text and border values with insufficient
contrast in the Daily Operations checklist and targets area.

## Implemented

- Restored the completed checkbox with:
  - green fill
  - green border
  - white check mark
- Added explicit completed selectors for both:
  - `.completed`
  - `.is-completed`
- Preserved green state when the row is also readonly.
- Increased Light Mode text, border and card contrast.
- Increased Dark Mode secondary text and border clarity.
- Improved pending and completed badge contrast.
- Improved progress-track visibility in both themes.
- Updated CSS cache-busting to `v=17.8.3`.

## Scope Lock

No changes to:

- JavaScript or task behavior
- Business Logic
- Supabase / SQL
- Permissions or routes
- Header / Sidebar
- Grid, spacing or responsive layout
- Application data

## Modified Files Only

- `assets/css/style.css`
- `index.html`
- `PHASE17.8.3_VERIFICATION.md`
