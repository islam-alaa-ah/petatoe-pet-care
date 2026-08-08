# Phase 17.8.1 — Daily Tasks Layout Recovery

## Root Cause

The daily task rows are generated as:

- checkbox input
- `.daily-task-check`
- content `<div>`
- status `<b>`

Successive Phase 17.6–17.8 CSS overrides changed the visual surface but did
not explicitly lock the RTL grid areas. As a result, the status badge collapsed
into a narrow column and wrapped vertically, while the row alignment and height
became distorted.

## Implemented

- Locked the real generated task-row structure using explicit CSS grid areas.
- Restored:
  - checkbox position
  - content column
  - status badge position
  - readable row height
  - correct RTL alignment
- Prevented the status badge from wrapping vertically.
- Added a controlled mobile layout.
- Updated CSS cache-busting in `index.html` to `v=17.8.1`.

## Scope Lock

No changes to:

- JavaScript
- Business Logic
- Supabase / SQL
- Permissions
- Header or Sidebar layout
- Other screens
- Data or task behavior

## Modified Files Only

- `assets/css/style.css`
- `index.html`
- `PHASE17.8.1_VERIFICATION.md`
