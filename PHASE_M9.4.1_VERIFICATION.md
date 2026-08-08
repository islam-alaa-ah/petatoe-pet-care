# Phase M9.4.1 — Desktop Drawer Logo Size Fix

## Scope
Desktop pointer/hover environments only.

## Root Cause
The drawer logo inherited the mobile full-fill rule (`width/height: 100%` with `object-fit: fill`) when the sidebar was visible on a wide desktop viewport, stretching and cropping the horizontal KYUM artwork.

## Fix
- Restricted the desktop drawer logo to a bounded 210 × 66 px box.
- Restored `object-fit: contain` and centered alignment.
- Reduced the desktop logo host height to 84 px.
- Left mobile portrait and touch-landscape rules unchanged.

## Regression Checks
- Header logo: unchanged.
- Mobile drawer logo: unchanged.
- Desktop navigation and business logic: unchanged.
- Version/build: unchanged.
