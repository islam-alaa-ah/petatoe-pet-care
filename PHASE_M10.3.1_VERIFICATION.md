# Phase M10.3.1 — User Representative Checkbox Layout Fix

## Root Cause
The custom checkbox renderer combined an absolutely positioned hidden input with a three-column grid. Existing global form/label sizing rules could collapse the name column inside the user dialog, causing representative names to wrap one or two characters per line and hiding the checkbox control.

## Scope
- User add/edit dialog only.
- Representative permission checklist only.
- No changes to data-scope payloads, database, RLS, Edge Functions, permissions, or version.

## Changes
- Replaced the custom decorative checkbox with a native visible checkbox.
- Rebuilt each representative row as a full-width RTL flex row.
- Added fixed checkbox sizing and a flexible name column.
- Prevented character-by-character wrapping and container collapse.
- Preserved search, Select All, Clear All, Own Representative Only, selected count, and saved selection restoration.

## Verification
- `node --check assets/js/app.js`: passed.
- Existing selector `#userAllowedRepresentativesList input[type="checkbox"]` remains compatible.
- Existing `allowedRepresentativeIds` payload remains unchanged.
- Layout changes are scoped to `.representative-check-*` classes.
