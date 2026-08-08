# Phase M8.3.2 — Header Controls & Finger-Tracking Indicator Fix

## Scope
Mobile only. No version, desktop, tablet, API, Supabase, permission, or business-logic changes.

## Root Cause
- The mobile header action wrapper kept a fixed 42px grid width while both the KYUM button and theme button were absolutely positioned inside it. Combined with older `display:none!important` rules, the controls could remain hidden or be clipped.
- The active indicator was moved only when the pointer crossed into another tab. It snapped to the selected tab instead of tracking the finger continuously.
- A non-zero indicator transition during hold introduced additional lag.

## Fix
- Converted the mobile header action wrapper to `display: contents` so both controls are positioned relative to `#appHeader`.
- Forced the KYUM floating control and theme toggle to remain visible and interactive.
- Restored the theme toggle to the far right and KYUM next to the menu button.
- Added continuous pointer-coordinate tracking for the active bubble.
- Removed animation lag only while press-and-drag is active.
- Preserved activation on release and prevented text selection/callout.

## Verification
- `node --check assets/js/mobile.js`: passed.
- Selectors are scoped to `@media (max-width: 767px)`.
- Only `assets/css/mobile.css` and `assets/js/mobile.js` were modified.
