# Phase 17.5.4 — Single Sidebar Launcher

## Root Cause

The header contained the KYUM Company menu launcher, while the sidebar
contained a separate brand block and a separate close button. When the
sidebar opened, the original launcher stayed outside the menu and a second
control appeared inside it.

## Implemented

- Kept one `sidebarMenuToggle` button only.
- Removed the separate sidebar close button.
- Removed the duplicate sidebar KYUM brand block.
- When the menu opens, the same KYUM Company button moves into the sidebar.
- Clicking the same button closes the sidebar.
- When the menu closes, the same button returns to its original header position.
- Outside click and Escape closing remain supported.
- Desktop push layout and mobile overlay behavior remain unchanged.
- No routes, permissions, reports, database code, or business logic changed.

## Modified Files Only

- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`
- `PHASE17.5.4_VERIFICATION.md`

## Verification

1. Open the application and confirm KYUM Company appears in the header.
2. Click it once.
3. Confirm the same button moves inside the top of the sidebar.
4. Confirm no extra X button or duplicate KYUM control appears.
5. Click the KYUM Company button again and confirm the menu closes.
6. Confirm the button returns to its original header position.
7. Open the menu and select a screen; confirm it closes and restores the button.
8. Test outside click and Escape.
