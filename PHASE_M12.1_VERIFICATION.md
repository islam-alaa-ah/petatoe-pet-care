# Phase M12.1 — Mobile Viewport & Desktop Layout Leakage Hotfix

## Root Cause

The mobile layer was active, but several desktop containers, action rows, table wrappers, tables and dynamically rendered rows were still allowed to preserve an intrinsic width larger than the phone viewport. In RTL mode this created a horizontal document overflow and left the browser anchored away from the correct mobile edge. The result looked like the desktop screen was being rendered inside the phone: headings were clipped, cards extended outside the viewport, and table labels and values were separated across an oversized row.

## Scope

- Contain the application shell, main content and all visible views inside the mobile viewport.
- Reset inherited desktop `min-width` and intrinsic table widths on mobile.
- Force affected administrative, quotations and follow-up tables to remain inside their cards.
- Make top action rows stack safely on phones.
- Reset accidental horizontal scroll after view changes, resize, orientation changes and dynamic rendering.
- Update mobile asset cache versions to `M12.1.0`.

## Files Modified

- `index.html`
- `assets/css/mobile.css`
- `assets/js/mobile.js`

## Not Modified

- `assets/js/app.js`
- Supabase
- SQL / RLS
- Authentication
- Permissions
- APIs / Queries
- Customers, Follow-ups or Quotations business logic
- Desktop or Tablet rules

## Verification

- `node --check assets/js/mobile.js`: passed.
- CSS braces: 620 opening / 620 closing.
- All new layout rules are isolated under `@media (max-width: 767px)`.
- Mobile asset versions in `index.html` are synchronized to `M12.1.0`.
- The hotfix targets the screens shown in the supplied screenshots: Dashboard, Follow-ups, Quotations and Sales Representatives, plus shared viewport containment for all mobile views.

## Physical Device Check Required

After deployment, clear the old PWA cache or fully close and reopen the installed app, then verify on iPhone and Android in portrait and landscape. The source-level checks passed; final pixel-level confirmation requires the deployed browser/WebView.

## GitHub Desktop Summary

### Summary

`Phase M12.1: fix mobile viewport overflow and desktop layout leakage`

### Description

- Constrain all mobile views and table cards to the phone viewport.
- Remove inherited desktop intrinsic widths from mobile rows and wrappers.
- Stack mobile action headers safely and prevent RTL horizontal displacement.
- Reset horizontal scroll after navigation and dynamic rendering.
- Synchronize mobile cache versions to M12.1.0.
