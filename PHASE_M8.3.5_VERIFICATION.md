# Phase M8.3.5 — Mobile Scroll & Navigation Performance Recovery

## Scope
Mobile-only performance recovery for the already approved fixed header and glass bottom navigation. No visual redesign, version change, desktop/tablet change, API, Supabase, permissions, or business-logic change.

## Root Cause
1. The mobile bottom navigation used a permanent 30px backdrop blur, multiple large shadows, and persistent `will-change`, forcing expensive compositing on iOS during every scroll frame.
2. The navigation gesture updated layout and preview state on every raw `pointermove` event instead of coalescing updates to one animation frame.
3. The compact-navigation logic recalculated geometry and repositioned the indicator during almost every scroll frame.
4. The global Phase M12.1 `MutationObserver` watched the complete app subtree and scheduled three viewport resets for every class/child mutation. Navigation preview classes and screen rendering therefore triggered repeated `scrollTo` calls and extra repaint work.
5. The navigation observer also watched `class` changes on the full navigation subtree, including the temporary preview classes generated during dragging.

## Changes
- Replaced continuous scroll-frame processing with a 90ms direction threshold/hysteresis update.
- Repositions the indicator only when compact state actually changes.
- Coalesced drag movement to one `requestAnimationFrame` update per rendered frame.
- Stops all gesture animation work immediately after release/cancel.
- Scoped the navigation observer to `hidden` and `aria-current` only.
- Removed the full-app subtree mutation observer used for horizontal reset.
- Reduced the glass blur and shadow workload while preserving the approved translucent appearance.
- Limited `will-change` to active finger tracking only.
- Added compositor-safe transforms/backface handling to fixed mobile chrome.

## Verification
- `node --check assets/js/mobile.js`: passed.
- Header remains fixed and its controls remain in their approved positions.
- Bottom navigation retains glass styling and compact/restore behavior.
- Finger tracking remains live and activates the selected tab only on release.
- No project version files were changed.
