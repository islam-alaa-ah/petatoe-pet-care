# Phase 17.8.6 — Badge Contrast Fix

## Root Cause

Neutral and open-status bubbles were inheriting generic muted text colors.
In Dark Mode this produced gray text on gray bubbles, while in Light Mode some
bubbles also retained low-contrast text.

## Implemented

- Dark Mode neutral / open bubbles:
  - navy background
  - white text
- Light Mode neutral / open bubbles:
  - light gray background
  - black text
- Applied the fix to:
  - alert cards
  - open-status bubbles
  - overdue delay bubbles
  - generic neutral badges, pills, chips and statuses
- Preserved semantic red, gold and green status colors.
- Kept Header and Sidebar explicitly untouched.

## Scope Lock

No changes to:

- Header or Sidebar
- Layout or spacing
- JavaScript or Business Logic
- Supabase / SQL
- Permissions or routes
- Responsive behavior
- Cards, borders, shadows or animation

## Modified Files Only

- `assets/css/style.css`
- `PHASE17.8.6_VERIFICATION.md`
