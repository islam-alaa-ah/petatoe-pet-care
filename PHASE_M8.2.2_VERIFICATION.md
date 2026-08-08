# Phase M8.2.2 — Mobile Light Mode Menu Contrast Fix

## Scope
CSS-only visual correction for the mobile main sidebar in Light Mode.

## Root Cause
The M8.2 menu rules changed card backgrounds for Light Mode but did not explicitly override the inherited dark sidebar text colors and opacity rules. This produced white or near-white labels and arrows on white cards.

## Fix
- Added explicit Light Mode colors for sidebar, launcher, titles, arrows and sub-items.
- Increased card/border contrast and preserved active-state visibility.
- Kept all selectors restricted to `max-width: 767px` and `html[data-theme="light"]`.
- Dark Mode and desktop/tablet layouts are untouched.

## Release
- Version: 18.3.4
- Build: 18304
