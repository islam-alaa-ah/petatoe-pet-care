# Phase 18.2 — Dashboard Attention Card Dark Mode Fix

## Baseline
Phase 18.1 was used as the only baseline.

## Root Cause
The dashboard attention rows still inherited the original Light Mode pastel backgrounds from `.attention-item` and `.attention-item.overdue`. No Dark Mode override targeted these exact rows.

## Implemented
- Dark navy attention surface with amber semantic border.
- Dark navy overdue surface with red semantic border.
- White primary text and readable light-gray secondary text.
- Dark hover state.
- Light Mode preserved.
- Cache updated to `18.2.0`.

## Scope Lock
No JavaScript, Business Logic, Supabase, SQL, Header, Sidebar, layout, dimensions, spacing or responsive changes.

## Modified Files Only
- `assets/css/style.css`
- `index.html`
- `PHASE18.2_VERIFICATION.md`
