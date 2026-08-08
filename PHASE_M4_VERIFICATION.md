# Phase M4 — Mobile Customer 360 Verification

## Root Cause
Customer 360 already contained the required customer data, quotations, follow-ups, unified activity timeline, notes, risk indicators, and existing permission-controlled actions. Its dialog and dense multi-column layout were primarily optimized for Desktop, causing cramped content, long horizontal information blocks, and weak one-hand navigation on phones.

## Scope
- Mobile-only full-screen Customer 360 dialog.
- Safe-area-aware header and content spacing.
- Mobile quick actions for phone and WhatsApp when a valid phone exists.
- Sticky jump navigation for profile, quotations, follow-up summary, unified activity, and follow-up history.
- Mobile layouts for status, KPI, risk, value, profile, quotation, activity, and timeline sections.
- Mobile treatment for the existing export dialog.
- Existing Customer 360 engine, rendering, permissions, edit, follow-up, export, and data sources remain unchanged.

## Files Modified
- `index.html`
- `assets/css/mobile.css`
- `assets/js/mobile.js`

## Not Modified
- `assets/js/app.js`
- `assets/js/customer360-engine.js`
- `assets/js/customer360-export.js`
- Supabase / SQL / RLS
- Authentication / permissions
- APIs / queries
- Customer or Customer 360 business logic

## Verification
- `node --check assets/js/mobile.js`: passed.
- `node --check assets/js/app.js`: passed regression syntax check.
- Mobile asset versions synchronized to `M4.0.0` in `index.html`.
- New visual rules are isolated under `@media (max-width: 767px)`.
- Quick actions are derived from the already-rendered customer subtitle and do not query or mutate application data.
- Section jump controls only scroll to existing Customer 360 sections.
- Existing action button IDs and permission visibility are unchanged.
- Delivery package excludes application logic, Supabase, SQL, and full-project files.

## Visual Verification Limitation
Static structure and syntax checks passed. Final visual verification must be performed with real Supabase data on an Android/iPhone viewport or browser device emulator after applying the files.

## GitHub Desktop Summary

### Summary
`Phase M4: optimize Mobile Customer 360`

### Description
- Add a safe-area-aware full-screen Customer 360 experience on phones.
- Add direct call and WhatsApp actions using the existing rendered phone number.
- Add sticky section navigation for customer data, quotations, follow-ups, and activity.
- Optimize existing Customer 360 cards, KPIs, timelines, and export dialog for narrow screens.
- Preserve Desktop, Tablet, Supabase, permissions, exports, and business logic.
