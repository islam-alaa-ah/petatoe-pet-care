# P5.13.8.69R4 — SEA VIBE Treasury Movement Serial & Actions

## Root Cause / Design Finding
The treasury was a read-only UNION view over trip revenue, expense rows, and Zawel top-ups. Expense rows had no persistent movement/header identity, so multiple expense lines created in one submission could not be recognized as one financial movement and there was no safe source-owned edit/delete flow from the treasury.

## Implemented Scope
- Added one persistent SEA VIBE treasury movement serial namespace: `SV-MOV-YYYY-######`.
- Added a persistent treasury movement serial to trip revenue and Zawel top-ups.
- Added `movement_group_id` + `movement_serial` to expense rows.
- New multi-line expense submissions are now inserted atomically as one movement; all expense lines created in the same submission share the same movement serial.
- Added `سيريال الحركة` before the treasury date column.
- Added final `حذف أو تعديل` actions column.
- Expense movement Edit opens the existing canonical Add Expense screen populated with every line in the movement.
- Expense movement edit supports changing scope (general / trip / asset), linked trip/asset, expense item, date, amount, payment method, notes, adding/removing lines, and adding new attachments.
- Expense movement Delete removes all non-system expense lines sharing the same movement group.
- Trip revenue Edit routes to the canonical trip edit screen.
- Zawel top-up Edit/Delete routes to the existing Zawel source flow.
- Sailing-permit/system movements remain source-managed and are not made directly editable from treasury.
- Existing legacy queued single-expense offline operations remain consumable after the upgrade.

## Safety / Business Rules
- Existing trip-close guard remains authoritative. A movement tied to a closed trip cannot be mutated until the trip is reopened.
- Treasury editing does not directly patch derived rows; changes are written through the source data owners.
- Existing single-expense delete actions outside Treasury retain their previous single-line behavior.
- No new CSS layer was added; the existing SEA VIBE table/form/button responsive owners are reused.

## Database Migration
Apply:
`supabase/migrations/phase_p5_13_8_69r4_treasury_movement_serial_actions.sql`

The migration backfills existing rows. Because historical multi-line submissions did not previously have a movement-header identity, each pre-R4 legacy expense row is backfilled as its own movement; all new multi-line submissions after R4 are grouped correctly under one serial.

## Verification
- JavaScript syntax: PASS (`sea-vibe.js`, `sea-vibe-service.js`, `localization-center.js`, `pwa.js`, `service-worker.js`).
- SEA VIBE static movement/action assertions: PASS.
- Enterprise Offline Compliance: PASS with the same documented unrelated `app.js` warning.
- Full Enterprise Offline Certification: PASS with declared online-only exclusions.
- Role-agnostic permissions: 12/12 PASS.
- Permission visibility consistency: 5/5 PASS.
- Localization lockdown: PASS.
- Final Mobile Enterprise Certification: 21/21 PASS.
- Version/PWA/App Shell unified at 18.55.92.

## Manual Regression Required
1. Create one trip expense movement with 3 expense lines; confirm all 3 treasury rows show the same movement serial.
2. Edit that movement from Treasury and change the trip, date, one expense item, one amount, and add/remove a line; confirm all derived trip/asset totals and treasury rows refresh correctly while the movement serial remains unchanged.
3. Delete a multi-line expense movement and confirm every line under that movement disappears and balances/totals reverse correctly.
4. Edit a trip-revenue row from Treasury and confirm it opens the trip edit screen.
5. Edit/delete a Zawel top-up from Treasury and confirm Zawel balance and Treasury update together.
6. Close a trip and verify direct edit/delete of its expense movement is rejected until the trip is reopened.
7. Verify Treasury on Desktop + Mobile, Light + Dark. The table should remain inside the existing horizontal-scroll owner on narrow screens.

## Modified Files
- `index.html`
- `assets/js/sea-vibe.js`
- `assets/js/sea-vibe-service.js`
- `assets/js/localization-center.js`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `package.json`
- `supabase/migrations/phase_p5_13_8_69r4_treasury_movement_serial_actions.sql`

## GitHub Desktop Summary
`Add grouped SEA VIBE treasury movement serials with source-owned edit/delete actions and atomic multi-line expense movements.`
