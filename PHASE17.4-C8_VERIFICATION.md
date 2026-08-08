# Phase 17.4-C8 — Header KYUM Scroll Logo

## Implemented

- Moved the scroll control from the bottom-right corner into the sticky header.
- Positioned it directly beside the current-user card.
- Replaced the letter `K` with the existing KYUM application icon:
  `assets/images/apple-touch-icon.png`
- The button remains visible and fixed as part of the sticky header.
- Existing behavior is preserved:
  - single click = scroll to top
  - double click = scroll to bottom
  - Home = scroll to top
  - End = scroll to bottom
- Removed the old floating button position.
- Added compact mobile sizing.

## Modified Files Only

- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`
- `PHASE17.4-C8_VERIFICATION.md`

## Verification

1. Open any application screen.
2. Confirm the KYUM icon button appears beside the user card.
3. Scroll down and confirm it remains inside the glass header.
4. Single-click and confirm the page moves to the top.
5. Double-click and confirm the page moves to the bottom.
6. Confirm no floating button remains at the bottom-right.
7. Verify the compact header icon on mobile.
