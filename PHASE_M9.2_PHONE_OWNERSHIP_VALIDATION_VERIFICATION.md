# Phase M9.2 — Customer Phone Ownership Validation

## Root Cause
- The Daily Operations view had no direct phone ownership lookup.
- Customer creation already blocked duplicate normalized phone numbers, but its warning returned only the customer name because the lookup query did not fetch the assigned sales representative.
- The Sales Representatives view displayed a Supabase implementation note that was not required in the user interface.
- Mobile Daily Operations action buttons could leak into desktop layout; desktop now explicitly hides only those two mobile-only actions.

## Files Modified
- `index.html`
- `assets/js/app.js`
- `assets/js/customers-service.js`
- `assets/css/style.css`

## Verification
- Added a phone lookup panel directly below the Daily Operations header area.
- Saudi phone normalization supports `05XXXXXXXX`, `5XXXXXXXX`, `9665XXXXXXXX`, and `009665XXXXXXXX` equivalents.
- Existing phone result displays customer name and assigned representative name.
- Company result also displays contact person when available.
- Unassigned customer result clearly states that no representative is assigned.
- Invalid phone format is rejected before querying.
- Duplicate customer creation is stopped before `saveCustomer()` / Supabase insert and displays customer and representative ownership.
- Existing edit exclusion by customer ID remains unchanged.
- Removed the Supabase note from Sales Representatives.
- Hid only `تحديث اليوم` and `تقرير الأداء` mobile toolbar actions on desktop; mobile behavior remains unchanged.
- JavaScript syntax checks passed for `assets/js/app.js` and `assets/js/customers-service.js`.
- No database schema, API, permission, version, desktop table, or business calculation changes.
