# Phase M10.3 — User Representative Checkbox Scope

## Scope
- Replaced the multi-select list in Add/Edit User with an accessible checkbox list.
- Added representative search, Select All, Clear All, and Own Representative Only actions.
- Added a live selected-count badge.
- Preserved the existing `allowedRepresentativeIds` payload and database/RLS behavior.

## Modified files
- `index.html`
- `assets/js/app.js`
- `assets/css/style.css`

## Verification
- Existing assigned representatives are checked when editing a user.
- Checkbox selections are collected and saved through the existing M10 service path.
- Search only filters visible choices and does not clear hidden selections.
- Mobile and desktop layouts remain responsive.
- No database, RLS, API, permission logic, or release version changes.
