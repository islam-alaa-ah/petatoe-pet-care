# P5.13.8.69R1 — SEA VIBE Treasury/Zawel Deployment Recovery

## Root Cause
The Treasury and Zawel implementation files existed in the delivered phase, but the release/cache contract was inconsistent:
- `version.json` was `18.55.88`.
- `assets/js/pwa.js` still declared `CURRENT_VERSION = 18.55.87`.
- `service-worker.js` still used the `18.55.86` cache generation.
- `index.html` still requested most local CSS/JS assets, including `app.js`, `localization-center.js`, and `pwa.js`, with `?v=18.55.86`.

This allowed the browser/service worker to keep serving the old navigation/runtime while the new Treasury/Zawel HTML and files were deployed. It also made the update runtime continually see a newer manifest than the active runtime, which can trigger repeated cache/update recovery work and explains the reported heaviness.

## Verification of the Last Implementation
Confirmed present in the phase source:
- Sidebar entries: `seaVibeTreasury`, `seaVibeZawel`.
- Views: `seaVibeTreasuryView`, `seaVibeZawelView`.
- App view and permission maps for Treasury/Zawel.
- UI renderers: `renderTreasury()`, `renderZawel()`.
- Zawel top-up service and offline queue action.
- SQL objects: `sea_vibe_zawel_transactions`, `sea_vibe_zawel_balance`, `sea_vibe_treasury_movements`, `sea_vibe_zawel_topup()`.
- Permission screens and Super Admin grants.
- Responsive SEA VIBE Zawel styles.

## Fix
- Release bumped to `18.55.89` / build `185589`.
- Unified `version.json`, `pwa.js`, `service-worker.js`, `package.json`, and all local asset query tokens in `index.html` to `18.55.89`.
- New service-worker cache generation: `petatoe-pwa-18-55-89-sea-vibe-treasury-zawel-r1`.
- Preserved Treasury/Zawel business logic and SQL without changing the financial rules.

## Regression / Certification
- JS syntax: PASS for `app.js`, `sea-vibe-service.js`, `sea-vibe.js`, `localization-center.js`, `pwa.js`, `service-worker.js`.
- Treasury/Zawel presence audit: PASS.
- Duplicate HTML IDs: 0.
- Role-agnostic permissions: 12/12 PASS.
- Permission visibility consistency: 5/5 PASS.
- Localization lockdown: PASS.
- Enterprise Offline Compliance: PASS with the pre-existing documented `app.js` warning only.
- Full Enterprise Offline Certification: PASS WITH DECLARED ONLINE-ONLY EXCLUSIONS.
- All 85 local CSS/JS asset version tokens unified at `18.55.89`.

## SQL
If the Treasury/Zawel migration was not already applied, run:
`supabase/migrations/phase_p5_13_8_69_sea_vibe_treasury_zawel.sql`

The two navigation items also depend on the new permission rows created by that migration.

## Manual Verification
1. Hard refresh / update once to 18.55.89.
2. Open SEA VIBE sidebar and confirm `الخزنة` and `رصيد زاول` are visible for Super Admin.
3. Open each screen and verify no continuous reload/update behavior.
4. Check Desktop/Mobile and Light/Dark.
5. If items are still hidden, verify the SQL migration was applied and the current user's permissions include `seaVibeTreasury.view` and `seaVibeZawel.view`.

## GitHub Desktop Summary
Recover SEA VIBE Treasury/Zawel deployment by synchronizing release, PWA, service-worker cache, and all local asset version tokens; preserve Treasury/Zawel logic, permissions, responsive UI, and offline sync.
