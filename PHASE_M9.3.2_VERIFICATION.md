# Phase M9.3.2 — Mobile Quotes Layout, Menu Branding & Landscape Mode Fix

## Baseline
- `kyum.company-main (9).zip`
- Applied existing Phase M9.3.1 files before this phase.

## Root Cause
1. Quotes toolbar, KPI cards, and filter sheet shared conflicting mobile stacking/spacing rules.
2. The quotes filter was implemented as a bottom sheet, so it collided with the fixed bottom navigation.
3. The latest-customers action inherited generic panel-header rules and could overlap the first rendered customer card.
4. The drawer brand host still expected the menu launcher to be moved into it; after header stabilization this left an unused rectangle.
5. Mobile activation depended only on `max-width: 767px`, causing landscape phones to fall back to desktop styling.

## Files Modified
- `index.html`
- `assets/js/app.js`
- `assets/js/mobile.js`
- `assets/css/mobile.css`

## Verification
- Quotes toolbar and KPI cards have separate flow spacing.
- Quotes filter opens centered with internal scrolling and remains above bottom navigation.
- Latest customers action is separated from rendered cards.
- Drawer shows `assets/images/kyum-header-logo.png`; no unused launcher rectangle remains.
- Menu launcher stays in the fixed header while drawer is open.
- Touch devices up to 1024px device width retain the mobile shell in landscape.
- Desktop non-touch layout and business logic are unchanged.
- No version, Supabase, API, permissions, or data changes.
