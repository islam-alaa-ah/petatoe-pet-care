# Phase M9.3.1 — Mobile Header Offset, Follow-ups Spacing & Zoom Lock

## Scope
Mobile-only layout stabilization. No business logic, API, Supabase, permissions, routing, desktop, tablet, or release-version changes.

## Root Cause
1. The fixed header retained a 90px height and 18px control offset, while the mobile drawer still started at viewport top. The header therefore overlaid the first drawer section.
2. The dashboard attention panel used a shared flex header with no dedicated spacing rule, allowing the action button and title to crowd each other on narrow screens.
3. The viewport allowed user scaling, and mobile form controls could trigger Safari auto zoom.

## Changes
- Reduced the mobile header height to 84px and moved its controls upward by 6px while preserving the safe area.
- Positioned the opened drawer below the fixed header and constrained its remaining viewport height.
- Added a dedicated class and mobile-only grid layout for the attention follow-ups panel header.
- Locked viewport scaling and set mobile form controls to 16px to prevent Safari field zoom.
- Added `touch-action: manipulation` to suppress double-tap zoom while preserving normal scrolling and taps.

## Verification
- Header remains fixed and does not cover the first drawer section.
- Dashboard attention title and action button no longer overlap.
- Double-tap and pinch zoom are disabled by viewport policy.
- Input focus does not auto-zoom on iPhone.
- Desktop and tablet rules remain unchanged.
