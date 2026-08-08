# Phase M12.3.2 — Android Startup Render & Observer Optimization

## Baseline
`kyum.company-main (7)(1).zip`

## Root Cause

1. The `customer-auth-ready` startup handler loaded reference data, customers, follow-ups, and quotations sequentially. Startup time therefore accumulated the latency of four independent requests.
2. Each data loader called `renderDashboard()` after completing, and the startup handler called it again. This caused repeated dashboard DOM rebuilds during authentication.
3. Mobile `MutationObserver` callbacks could run repeatedly within the same browser frame while tables and cards were being rendered, increasing layout/repaint pressure on Android WebView and lower-powered devices.

## Changes

### `assets/js/app.js`
- Added a small dashboard render batching mechanism.
- Customer, follow-up, and quotation loaders now request a dashboard render rather than forcing an immediate render while a startup batch is active.
- The four independent startup loads now execute through `Promise.all()`.
- Dashboard rendering is consolidated to one final render after the startup data batch completes.
- Existing individual screen renders and data transformations remain unchanged.

### `assets/js/mobile.js`
- Added `createRafMutationObserver()`.
- Existing mobile MutationObservers are now coalesced to at most one callback per animation frame.
- Observer targets, selectors, and UI behavior remain unchanged.

### Version and cache
- Version: `18.3.8`
- Build: `18308`
- Service Worker cache: `kyum-crm-pwa-18-3-8-m12-3-2`

## Protected Scope
No changes were made to:
- permissions or `can_view`
- role logic
- RLS, SQL, or Supabase schema
- customer/representative data scope
- calculations or report business logic
- import/export validation rules

## Verification
- JavaScript syntax checked with `node --check` for `app.js`, `mobile.js`, and `pwa.js`.
- Version references checked for consistency.
- Modified-file package preserves original repository paths.
