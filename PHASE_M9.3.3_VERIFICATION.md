# Phase M9.3.3 — Mobile Filter Execution, Quote Spacing & English Quote Values

## Scope
- Quotations mobile toolbar/KPI spacing.
- Explicit Apply action for quotations and dashboard filters.
- KYUM drawer logo exact fit.
- English-number SAR formatting for quotation monetary values.

## Verification
- Quotations toolbar remains in normal document flow above KPI cards with no overlap.
- Quotation filter changes remain draft until `تنفيذ الفلترة` is pressed.
- Closing by X/backdrop restores the last applied filter values.
- Dashboard filter has an explicit `تنفيذ الفلترة` action and does not auto-apply while open.
- Drawer logo fills its reserved rectangle without overflow.
- Quotation values use `en-US`, `SAR`, and English digits.
- No database, Supabase, permission, routing, or release-version changes.
