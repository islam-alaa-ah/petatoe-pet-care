# Phase 17.4-C6 — Sticky Glass Header

## Implemented

- Converted the upper application area into one unified header.
- Moved the `KYUM Company` menu button inside the header.
- Header now contains:
  - KYUM Company menu button
  - current page title and subtitle
  - current user card
- Header remains visible while scrolling using sticky positioning.
- At the top of the page the header stays visually transparent.
- After scrolling down, the header becomes glass-like with:
  - background blur
  - transparency
  - subtle border
  - soft shadow
- Header returns to transparent style when scrolling back to the top.
- Mobile layout keeps the title and a compact KYUM button.
- Existing dynamic sidebar behavior remains unchanged.

## Modified Files Only

- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`
- `PHASE17.4-C6_VERIFICATION.md`

## Verification

1. Refresh the application at the top of any screen.
2. Confirm KYUM Company, page title, and user card are inside one header.
3. Scroll down.
4. Confirm the header remains fixed at the top and becomes glass-like.
5. Scroll back to the top.
6. Confirm the glass effect is removed.
7. Open and close the sidebar from the KYUM button.
8. Verify desktop and mobile widths.
