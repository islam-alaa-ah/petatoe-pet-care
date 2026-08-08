# Phase M8.3.1 — Header & Glass Navigation Regression Fix

## Root Cause

1. The earlier canonical mobile shell declared `#appHeader.topbar` as `position: relative !important`, while the enhancement later declared `position: sticky` without `!important`. The earlier rule therefore won and allowed the header to leave the viewport during scrolling.
2. The enhancement used a negative header margin and unconstrained absolute controls with `overflow: visible`, allowing the floating KYUM control to render outside the visual header boundary.
3. The theme control received new absolute positioning without final authoritative constraints, so prior mobile header rules could alter its final placement.
4. The bottom navigation glass background was derived from `--header-glass`; in the active theme this resolved too opaquely, hiding the backdrop blur.
5. Press-and-hold did not block iOS text selection, touch callout, context menu, or drag selection. Pointer coordinates were also not constrained to the navigation bounds.

## Scope

Modified only:

- `assets/css/mobile.css`
- `assets/js/mobile.js`

No changes to desktop/tablet styling, routes, APIs, Supabase, permissions, business logic, or release version.

## Verification

- Mobile header is forced to remain sticky with final authoritative rules.
- KYUM logo, menu button, theme toggle, and centered title remain within the header bounds.
- Theme toggle remains at the original right-side mobile position.
- Bottom bar uses explicit translucent RGBA surfaces in Light and Dark modes.
- `backdrop-filter` and `-webkit-backdrop-filter` remain active.
- Text selection, touch callout, context menu, and drag selection are disabled only inside the bottom navigation.
- Pointer preview coordinates are clamped to the bottom navigation rectangle.
- Tab activation remains deferred until pointer release during hold navigation.
- `node --check assets/js/mobile.js` passed.
