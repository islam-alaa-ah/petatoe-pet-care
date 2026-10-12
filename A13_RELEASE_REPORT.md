# A13 — Sales Reports blank customer/team option labels

## Baseline
A12_Daily_Axis_Spacing/assets/js/sales-reports.js (phase A12). The original project ZIP is older than A12; retain the previously approved A2–A12 deliveries in the live project.

## Root cause
`uniqueOptions()` returns `{id,name,plate}`, while `populateFilters()` used `x.label` for customer and team. `option()` escapes undefined into blank text. Native select options therefore had values but no visible captions in Light and Dark mode.

## Impact
Customer and team options become readable; existing option values, selection preservation, dataset filtering, calculations, caching, SQL/RPC, and layout remain unchanged.

## Scope
Only `assets/js/sales-reports.js`, two property references: `x.label` -> `x.name` in customer and team option builders.

## Regression risk
Low. No CSS, DOM structure, option values, or data logic altered. `node --check` PASS; exact 2-hunk diff audit PASS. Browser live regression (all years/months, customer/team selections, Light/Dark) pending user verification.

## CSS Ownership/Cascade Audit
No CSS modified, no override layer added. Existing owner `assets/css/sales-reports.css` untouched. Issue originates in JS label selection, not cascade.

## Deploy
Overlay the single modified file at its original path, preserving all other A12-approved assets. Refresh app without clearing any offline queue.
