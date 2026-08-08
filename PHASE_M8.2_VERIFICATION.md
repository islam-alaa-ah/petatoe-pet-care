# Phase M8.2 — Mobile Main Menu Layout Refinement

## Scope
- Mobile sidebar/menu layout only.
- No changes to Supabase, permissions data, reports, customers, or business logic.

## Implemented
- Added a unified `الرئيسية` accordion section.
- Moved Dashboard and Daily Operations into the main section.
- Reduced header, section, item, and vertical spacing sizes.
- Restored visible KYUM launcher text inside the opened menu.
- Enforced one-open-section-at-a-time accordion behavior.
- Added consistent light/dark mobile styling.
- Synchronized release to v18.3.2 build 18302.

## Verification
- `node --check assets/js/app.js`
- JSON parse: `version.json`, `package.json`
- Desktop rules unchanged; all new layout rules are scoped to `max-width: 767px`.
