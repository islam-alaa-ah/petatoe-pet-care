# P5.13.8.60 — Desktop Header Back Navigation

## Root Cause
The approved desktop header had no in-app back control. Existing SPA navigation already owns route history through `switchView()` / `syncRouteLocation()` using `history.pushState`, so a second navigation system was neither required nor appropriate.

## Scope
- Added one desktop header back button in the existing `topbar-user-actions` owner.
- Reused the existing SPA browser-history route owner.
- Added an app-local `kyumDepth` marker so the button is enabled only when a prior PETATOE view exists in the current app route chain; it will not intentionally navigate outside the app.
- Added canonical Arabic/English localization key `shared.header.back`.
- Added the button to the existing mobile hidden-control contract, preserving the frozen mobile header.
- No SQL, Supabase, RLS, permissions, business logic, calculations, or screen data changes.

## Modified Files
- `index.html`
- `assets/css/petatoe-navigation-shell.css`
- `assets/js/app.js`
- `assets/js/localization-center.js`
- `version.json`
- `service-worker.js`

## Verification
- `node --check assets/js/app.js` — PASS
- `node --check assets/js/localization-center.js` — PASS
- `node --check service-worker.js` — PASS
- `node scripts/p5-13-4-localization-lockdown-check.mjs` — PASS
- `node scripts/current-navigation-header-certification-check.mjs` — 10/10 PASS
- Version/cache aligned at `18.55.78` / build `185578`.

## Manual Regression Check
1. Desktop: navigate between two or more screens and use the new back button; confirm it returns to the immediately previous PETATOE screen.
2. First app screen: confirm the button is disabled when there is no prior PETATOE route in the current route chain.
3. Arabic/English: confirm tooltip/accessibility text localizes and arrow direction mirrors with RTL/LTR.
4. Light/Dark: confirm the control keeps the approved header identity.
5. Mobile/touch header: confirm no new back control appears and existing menu/scroll-logo/theme layout is unchanged.
