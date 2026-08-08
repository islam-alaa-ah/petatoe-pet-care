# Phase M8.3.4 — Stable Header & Direct Finger-Tracking Glass Navigation

## Root Cause

1. Multiple mobile navigation handlers were active simultaneously: the original pointer handler and an additional iOS touch fallback. Both modified the same indicator and click suppression state, producing jumps instead of continuous tracking.
2. The mobile header had accumulated conflicting sticky/fixed height rules. The final fixed rule used a compressed 72px height, which made the controls visually cramped.
3. The bottom navigation used a relatively opaque theme background, limiting the visible glass/blur effect.

## Scope

Mobile only (`max-width: 767px`). No desktop/tablet, API, database, Supabase, permissions, business logic, or release version changes.

## Files Modified

- `assets/css/mobile.css`
- `assets/js/mobile.js`

## Verification

- JavaScript syntax: `node --check assets/js/mobile.js` passed.
- Header is fixed with reserved content spacing.
- Menu, KYUM logo, centered title, and theme control remain inside the header.
- One pointer-driven gesture engine controls the bottom navigation.
- Indicator position is calculated continuously from the finger X coordinate.
- Nearest tab is previewed during drag and activated only on release.
- Text selection, callout, and native dragging remain disabled inside the navigation.
- Bottom navigation uses a lower-opacity glass surface with stronger backdrop blur.
