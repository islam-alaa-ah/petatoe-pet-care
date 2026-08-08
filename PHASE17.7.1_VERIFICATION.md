# Phase 17.7.1 — Glass Clarity Fix

## Root Cause

Phase 17.7 applied the glass reflection layer to every card and task row.
This caused a washed-out grey overlay, reduced text contrast, and made the
repeated blue accent lines visually noisy. The Daily Operations cards also
used dark glass even when the global application theme was light, while text
colors still followed light-theme variables.

## Implemented

- Removed the full-card reflection pseudo-layer.
- Applied a darker and more opaque glass surface.
- Added explicit readable text and muted text colors inside Daily Operations.
- Reset readonly task opacity to preserve readability.
- Removed repeated accent lines from task rows and inner cards.
- Kept only short, low-opacity KPI accent lines.
- Reduced large-panel color tint to a subtle top-border cue.
- Kept natural shadows only; no neon or outer glow.
- Preserved glass buttons with corrected text contrast.
- Kept hover subtle with no movement or scaling.

## Scope Lock

No changes to:

- JavaScript or Business Logic
- Supabase, SQL, permissions or routes
- Header or Sidebar layout
- Grid, padding, typography or responsive rules
- Data or application functionality

## Modified Files Only

- `assets/css/style.css`
- `PHASE17.7.1_VERIFICATION.md`
