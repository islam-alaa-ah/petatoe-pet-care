# P5.13.8.69R5 — SEA VIBE Date Consistency Recovery

## Root Cause
- `sea_vibe_treasury_movements.movement_at` mixed business dates (`trip_date`, `expense_date`, `transaction_date`) with `timestamptz` and `created_at`, causing timezone-dependent day shifts.
- Zawel top-ups were sorted by `created_at`, not `transaction_date`.
- Sailing-permit wallet rows did not explicitly inherit `trip_date`; trip-date-only edits did not propagate to existing permit/adjustment rows.
- Treasury filtering used the timestamp string while display converted it to local time, so filter date and visible date could disagree.
- Retryable/offline Zawel top-up fallback did not always mirror the treasury movement; offline trip edits did not mirror the permit-points wallet effect.

## Canonical Fix
- Added `movement_date DATE` to the end of the treasury view without changing existing view column order/types.
- `movement_date` sources: trip revenue = `trip_date`; expense = `expense_date`; Zawel top-up = `transaction_date`.
- `movement_at` is now an audit/creation timestamp only and is never used as the displayed business date.
- Treasury UI filters/displays by `movement_date`.
- Zawel orders by `transaction_date DESC, created_at DESC`; Treasury orders by `movement_date DESC, movement_at DESC`.
- Permit and permit-adjustment wallet rows always use the trip date. Changing only the trip date updates all linked wallet rows.
- Existing permit/adjustment rows are safely realigned to their trip dates by the migration. Manual top-up dates are not rewritten.
- Offline/retryable top-ups now mirror the selected date into the local treasury snapshot; offline trip changes mirror permit-point balance/date effects until server sync replaces the optimistic state.

## Scope / Modified Files
- `assets/js/sea-vibe-service.js`
- `assets/js/sea-vibe.js`
- `supabase/migrations/phase_p5_13_8_69r5_sea_vibe_date_consistency.sql`
- `assets/js/pwa.js`
- `version.json`
- `package.json`
- `index.html`
- `service-worker.js`

## Verification
- JavaScript syntax: PASS (`sea-vibe-service.js`, `sea-vibe.js`, `pwa.js`, `service-worker.js`).
- Static date-contract checks: PASS.
- UTF-8/mojibake scan: PASS.
- Version/cache consistency: PASS — `18.55.95`, build `185595`, 85/85 index asset tokens unified.
- Role-agnostic permissions: 12/12 PASS.
- Permission visibility consistency: 5/5 PASS.
- Mobile final certification: 21/21 PASS.
- Full enterprise offline certification: PASS with the same pre-existing documented `app.js` warning unrelated to SEA VIBE.

## Manual Verification Required
1. Edit a Zawel top-up to a different date; confirm Zawel and Treasury show exactly the same Gregorian date.
2. Add a trip expense and a general expense; confirm Treasury date equals the entered expense date with no artificial `03:00 AM` time.
3. Change a trip date only; confirm the sailing-permit expense and all linked Zawel permit/adjustment rows move to the new trip date.
4. Change people count/duration; confirm the new permit adjustment uses the trip date.
5. Test Treasury From/To filters against the visible date.
6. Repeat Zawel top-up while offline/retryable and verify the optimistic Treasury date matches the selected top-up date, then confirm after sync.

## GitHub Desktop Summary
Fix SEA VIBE business-date consistency across trips, expenses, Zawel wallet and Treasury; remove timezone-derived date drift and align permit/offline behavior.
