# Phase M7.1 — Mobile Header & WhatsApp Number Hotfix

## Root Cause

1. WhatsApp links were generated independently in Mobile Customers, Customer 360, Mobile Follow-ups, and Mobile Quotations.
2. The existing implementations only removed `+` or `00`; they did not convert Saudi local numbers beginning with `05` into the international `9665...` format.
3. The mobile header reused the desktop title and launcher layout inside a narrow three-column grid, while also retaining large desktop branding rules. This caused excess height, clipped titles, and duplicated screen identity.

## Scope

- Added one shared Saudi phone normalization utility in `assets/js/mobile.js`.
- Routed all WhatsApp actions added in Phases M3–M7 through the shared utility.
- Routed the related mobile call actions through the same normalized number.
- Added a compact mobile-only app header with menu, KYUM CRM branding, and theme control.
- Added iPhone safe-area handling and reduced mobile top spacing.
- Preserved the original desktop launcher markup and restore it automatically outside mobile width.
- Added a one-column KPI fallback only below 340px.

## Files Modified

- `index.html`
- `assets/css/mobile.css`
- `assets/js/mobile.js`
- `PHASE_M7.1_VERIFICATION.md`

## Not Modified

- `assets/js/app.js`
- Supabase / SQL / RLS
- Authentication / Permissions
- APIs / Queries
- Customer, Follow-up, or Quotation CRUD
- Desktop and Tablet header logic

## Verification

### JavaScript

- `node --check assets/js/mobile.js`: passed.
- Only one direct `https://wa.me/` builder remains, inside the shared central utility.
- Mobile assets version synchronized to `M7.1.0` in `index.html`.

### Saudi number normalization

All required inputs passed and returned `966508638573`:

- `0508638573`
- `+966508638573`
- `966508638573`
- `00966508638573`
- `+966 50 863 8573`
- `05-0863-8573`

Verified final URL:

`https://wa.me/966508638573`

### Isolation

- Header CSS is restricted to `@media (max-width: 767px)`.
- The original desktop launcher markup is restored when the viewport leaves mobile width.
- No business logic file is included in the delivery package.
- Bottom navigation spacing remains included in `.main-content` bottom padding.

### Visual limitation

Static and structural checks passed. Final device verification is still required on the live Supabase build for iPhone/Android, Portrait/Landscape, and Light/Dark modes.

## GitHub Desktop Summary

**Summary**

`Phase M7.1: refine mobile header and normalize Saudi WhatsApp numbers`

**Description**

- Add a compact safe-area-aware KYUM CRM mobile header.
- Remove duplicated mobile page-title branding and reduce top spacing.
- Centralize Saudi phone normalization for all mobile WhatsApp actions.
- Generate valid `wa.me/966...` links and normalized call links.
- Preserve Desktop, Tablet, Supabase, permissions, and business logic.
