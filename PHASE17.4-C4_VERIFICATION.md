# Phase 17.4-C4 — Customer Interest Checkbox Dropdown

## Implemented

- Replaced the native multi-select list in the customer Add/Edit dialog.
- Added a modern dropdown with a checkbox for every interest category.
- Added search inside the dropdown.
- Added:
  - Select all
  - Clear all
  - Selected count
- The dropdown remains open while selecting multiple interests.
- Selected values are summarized in the closed field.
- Existing database storage and customer save logic remain unchanged.
- Existing customer interests are selected correctly when editing.
- Added outside-click and Escape-key closing.
- Added mobile bottom-sheet-style positioning.

## Modified Files Only

- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`
- `PHASE17.4-C4_VERIFICATION.md`

## Verification

1. Open Add Customer.
2. Click Interest Category.
3. Select several checkboxes.
4. Search for an interest.
5. Test Select All and Clear All.
6. Save the customer and reopen it for editing.
7. Confirm all saved interests remain checked.
8. Confirm no Ctrl key is required.
9. Test the dropdown on mobile width.

## Scope

No database, service, permission, import, or export logic was changed.
