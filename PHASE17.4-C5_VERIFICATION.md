# Phase 17.4-C5 — Dynamic Sidebar Menu

## Implemented

- Converted `KYUM Company` into a visible menu button.
- The right sidebar is hidden by default.
- Clicking `KYUM Company` opens the sidebar as an off-canvas drawer.
- Clicking outside the sidebar closes it.
- Clicking the close button closes it.
- Pressing Escape closes it.
- Selecting any navigation item closes it automatically.
- All grouped tabs start collapsed every time the sidebar opens.
- Removed saved open/closed accordion state.
- Removed automatic expansion of the active navigation group.
- Kept permissions and navigation destinations unchanged.
- Added responsive desktop and mobile behavior.

## Modified Files Only

- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`
- `PHASE17.4-C5_VERIFICATION.md`

## Verification

1. Refresh the application.
2. Confirm the sidebar is hidden.
3. Click the `KYUM Company` button.
4. Confirm all grouped sections are collapsed.
5. Expand a section and select a screen.
6. Confirm the sidebar closes after selection.
7. Reopen it and confirm all sections are collapsed again.
8. Click outside the sidebar and confirm it closes.
9. Press Escape and confirm it closes.
10. Verify the same behavior on mobile width.
