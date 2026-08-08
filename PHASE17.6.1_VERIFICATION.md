# Phase 17.6.1 — Softened KYUM Card Glow

## Root Cause

The border colors were acceptable, but the outer glow values in Phase 17.6
were too strong, especially in Dark Mode and on hover.

## Implemented

- Kept all card borders at `2px`.
- Kept the same KYUM Blue, Gold, and Red border colors.
- Reduced normal glow intensity to roughly 35–40% of the previous level.
- Reduced blur radius and glow opacity.
- Limited hover enhancement to a small increase only.
- Applied matching softer values in Light and Dark modes.

## Explicitly Not Changed

- Card color distribution
- Border thickness
- Layout, spacing, padding, grid, sizes, typography
- Header, sidebar, dynamic menu, push layout
- Responsive behavior
- JavaScript, Business Logic, Supabase, SQL, permissions, routes

## Modified Files Only

- `assets/css/style.css`
- `PHASE17.6.1_VERIFICATION.md`
