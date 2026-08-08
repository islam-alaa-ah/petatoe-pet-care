# Phase M12.2 — Android Touch & Performance Recovery

## Scope
Android mobile runtime only. No permissions, RLS, Supabase, reports, customer, quotation, follow-up, or import business logic was changed.

## Root causes fixed
1. Bottom navigation cancelled every pointerdown and suppressed native clicks. Android pointercancel/lostpointercapture could therefore leave a tap without navigation.
2. Vertical page movement could be captured as bottom-navigation drag.
3. Stale body drawer/sheet lock classes could leave the page with touch-action disabled after resume/navigation.
4. Authentication ready triggered a second full dashboard render.
5. Heavy header/bottom-nav backdrop blur remained active during Android scrolling.
6. Service-worker cache version lagged behind the application version.

## Changes
- Native taps are no longer prevented.
- Horizontal drag starts only after 12px; vertical movement returns immediately to page scrolling.
- pointercancel only cleans state and never suppresses the next click.
- Defensive touch-lock cleanup on pageshow, visibilitychange, hashchange, and popstate.
- Removed duplicate mobile dashboard refresh after authentication.
- Android-only CSS disables expensive fixed-surface blur while preserving light/dark surfaces.
- Service-worker cache bumped to 18.3.5-m12-2.

## Verification
- JavaScript syntax check: required.
- Normal tap, press-drag, vertical scroll, drawer open/close, app background/resume, orientation change, light/dark mode.
