# KYUM CRM Mobile — Enterprise Header & Glass Bottom Navigation Enhancement

## Root Cause

- The mobile header was assembled dynamically in `assets/js/mobile.js`, while several historical mobile CSS phases applied conflicting grid, spacing, and visibility rules to the same header elements.
- The KYUM scroll control already contained the approved single-tap/double-tap behavior, but mobile CSS explicitly hid it.
- The bottom navigation used a fixed full-width bar and per-item active backgrounds. It did not have one persistent active indicator, scroll-direction sizing behavior, or pointer tracking for press-and-hold navigation.

## Scoped Files Modified

- `assets/css/mobile.css`
- `assets/js/mobile.js`

## Verification

- Mobile-only media query scope retained at `max-width: 767px`.
- Existing desktop/tablet markup and styles were not changed.
- Existing KYUM single-tap scroll-to-top and double-tap scroll-to-bottom logic was reused without changing business logic.
- Header title is independently centered with absolute positioning.
- KYUM logo is exposed as a floating glass button beside the menu button.
- Bottom navigation uses a single transform-driven indicator.
- Scroll-down compacts the bar; scroll-up restores it using a requestAnimationFrame-throttled listener.
- Press-and-hold previews tabs during movement and activates only on release.
- JavaScript syntax check passed with `node --check assets/js/mobile.js`.
- No API, Supabase, permissions, database, release version, or business-logic files were modified.
