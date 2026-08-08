# Phase M8.3.3 — Persistent Header & Live Finger Tracking Fix

## Scope
Mobile-only corrective fix for:
- Mobile header disappearing during page scrolling.
- Bottom navigation active bubble not following the user's finger continuously.

## Root Cause
1. The header remained inside `.main-content`, and several legacy mobile rules alternated between `relative` and `sticky`. Sticky positioning was not reliable because the header was inside a scrolling/layout context affected by overflow and accumulated overrides.
2. iOS Safari did not deliver sufficiently reliable continuous Pointer Events for the current captured navigation item. The indicator therefore updated mainly when the final target changed or after release.

## Changes
- Made `#appHeader` fixed to the mobile viewport.
- Reserved the fixed header height in `.main-content`.
- Preserved the menu, KYUM logo, centered brand, and theme toggle positions.
- Added iOS Touch Events tracking on `window` for continuous finger coordinates.
- Disabled touch handling in the older Pointer Events path to prevent duplicate gestures.
- Kept navigation activation on release after an actual drag.

## Regression Boundaries
- No desktop or tablet rules changed.
- No business logic, API, Supabase, permissions, routes, or release version changed.
- No screens outside the mobile header and bottom navigation were modified.

## Verification
- `node --check assets/js/mobile.js`: passed.
- ZIP contains only modified files under their original repository paths.
