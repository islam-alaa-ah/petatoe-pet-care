# P5.13.8.70 — Vehicle Treasury

## Scope
- Added `خزينة السيارة` under Appointment Management.
- One treasury workspace per permitted appointment team / linked car.
- Cash appointment invoices are revenue sources; manual vehicle expenses are treasury outflows.
- Visibility and mutations are protected by both `vehicleTreasury` screen permissions and the canonical `can_access_installation_team()` scope.
- Desktop/mobile and light/dark styles are scoped to `#vehicleTreasuryView` and the dedicated dialog.

## Canonical ownership / design
- Invoice revenue is **not copied** to a second ledger table. `get_vehicle_treasury_workspace()` reads the canonical `sales_invoices` + appointment collection/team/visit sources dynamically. Therefore invoice amount/date/payment edits are reflected automatically and cannot leave a duplicate stale revenue movement.
- Manual vehicle-treasury expenses are owned by `vehicle_treasury_expenses` and use RPCs for add/update/delete.
- Cash classification follows the same appointment invoice display precedence: `installation_request_collection.payment_method`, then `sales_invoices.payment_method`.
- Invoice revenue uses `sales_invoices.final_amount` when present (VAT-inclusive post-discount value), otherwise the legacy invoice amount with 15% VAT fallback.

## Permission / team scope
- New permission key: `vehicleTreasury`.
- New app screen: `خزينة السيارة`, group `إدارة المواعيد`.
- Super Admin receives full default authority; other roles remain ungranted until configured through the existing permission matrix.
- SQL RPCs enforce `public.can_access_installation_team(team_id)` for read/add/edit/delete.

## Offline / sync
- Last successful workspace is cached for offline read.
- Expense create/update is registered with the existing Enterprise Offline Queue and Sync Engine.
- Delete remains online-only (consistent with the existing tombstone rule for offline deletion).
- New service is registered in `enterprise-offline-policy.json` and all new local assets are in the Service Worker App Shell.

## Modified files
- `index.html`
- `assets/js/app.js`
- `assets/js/localization-center.js`
- `assets/js/vehicle-treasury-service.js` (new)
- `assets/js/vehicle-treasury.js` (new)
- `assets/css/vehicle-treasury.css` (new)
- `enterprise-offline-policy.json`
- `supabase/migrations/phase_p5_13_8_70_vehicle_treasury.sql` (new)
- `service-worker.js`
- `assets/js/pwa.js`
- `version.json`
- `package.json`

## Version
- App: `18.55.97`
- Build: `185597`
- Cache: `petatoe-pwa-18-55-97-vehicle-treasury-p5-13-8-70`

## Verification
- JavaScript syntax: PASS (`app.js`, localization, vehicle treasury service/UI).
- Duplicate HTML IDs: PASS — 0 duplicates.
- Permission role-agnostic: 12/12 PASS.
- Permission visibility consistency: 5/5 PASS.
- Permission matrix authority: 11/11 PASS.
- Permission full authority: 12/12 PASS.
- Localization lockdown: PASS.
- Mobile final certification: 21/21 PASS.
- Full Enterprise Offline Certification: PASS with the pre-existing documented `app.js` warning only.
- PWA/version/cache token consistency: PASS.

## Required deployment step
Run:
`supabase/migrations/phase_p5_13_8_70_vehicle_treasury.sql`

No live Supabase database was modified from this environment; runtime data validation starts after the migration is applied.

## Manual regression checklist
1. Grant `vehicleTreasury` view/add/edit/delete to a test user and grant only one appointment team; verify only that team's car is visible.
2. Open an appointment cash invoice and verify its VAT-inclusive, post-discount amount appears as revenue for the execution car.
3. Change the same invoice payment method from `نقدي` to card; verify the revenue disappears from the vehicle treasury without a compensating duplicate row.
4. Change it back to cash and change invoice amount/date; verify the same source revenue reflects the new data.
5. Add a vehicle expense and verify balance = cash revenue − expenses.
6. Edit/delete the expense and verify the balance updates in place.
7. Check Desktop and Mobile in Light and Dark mode.
8. Disconnect after one successful load and confirm cached read works; queue an expense create/update and confirm it syncs after reconnect.

## GitHub Desktop summary
`Add permission-scoped vehicle treasury for appointment cars with cash-invoice revenue, manual expenses, responsive UI, and offline queue integration.`
