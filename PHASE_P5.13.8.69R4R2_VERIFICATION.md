# P5.13.8.69R4R2 — SEA VIBE Treasury Actions Runtime Fix

## Root Cause
The Treasury action buttons were rendered correctly, and the grouped delete RPC already existed, but the Edit runtime path failed before navigation because `loadExpenseMovement()` called `syncExpenseScope()` while that canonical UI helper was missing from `sea-vibe.js`. This caused a `ReferenceError` on Edit and stopped the source form from opening.

A second reliability issue was that Edit depended only on the in-memory/Smart Cache expense snapshot. If the Treasury view had newer movement metadata than the cached expense rows, the UI could not resolve the movement lines even though the movement existed in Supabase.

## Fix
- Restored the missing canonical `syncExpenseScope()` owner.
- The helper now exclusively controls Trip/Asset scope visibility and `required` state in the existing Add Expense form; no CSS override layer was added.
- Converted Treasury expense Edit loading to an async source-owned flow.
- Added `SeaVibeService.getExpenseMovement(groupId)`:
  - uses the current snapshot when complete;
  - falls back to a direct Supabase read by `movement_group_id` when the cache does not contain the movement;
  - keeps the existing Add Expense screen as the sole editor.
- Treasury Edit now awaits movement loading, opens the canonical Add Expense screen, and stops further click fall-through.
- Treasury Delete remains source-owned through `sea_vibe_delete_expense_batch`; the click path is now explicit, guarded, and reports successful completion in the Treasury status area.
- Added a localized Treasury deletion success status.
- No database migration is required for R4R2. The previously applied R4R1 database hotfix remains authoritative.

## Delete Verification
The delete path was traced end-to-end:
1. Treasury button carries the movement `expense_group_id`.
2. The delegated handler calls `SeaVibeService.deleteExpenseMovement(groupId)`.
3. The service enforces `seaVibeExpenseNew.delete`, online-only mutation safety, and calls `sea_vibe_delete_expense_batch(p_group_id)`.
4. The existing RPC removes all non-system expense lines in the movement and preserves the closed-trip guard.
5. The service refreshes the SEA VIBE snapshot, and Treasury/General/Trip Details/Assets re-render after success.

## Verification
- `node --check assets/js/sea-vibe.js`: PASS
- `node --check assets/js/sea-vibe-service.js`: PASS
- `node --check assets/js/localization-center.js`: PASS
- Treasury action static runtime assertions: PASS
  - `syncExpenseScope` owner exists
  - Edit handler awaits source movement loader
  - Delete handler calls grouped delete service
  - Service has direct movement fetch fallback
  - Service exports `getExpenseMovement`
  - grouped delete RPC call remains present
- Role-agnostic permissions: 12/12 PASS
- Permission visibility consistency: 5/5 PASS
- Full Enterprise Offline Certification: PASS with the same unrelated documented `app.js` warning
- Final Mobile Enterprise Certification: 21/21 PASS
- Localization lockdown: PASS
- Version/PWA/App Shell unified at `18.55.93`

## Manual Regression Required
1. In Treasury, click Edit on an expense movement and confirm the existing Add Expense screen opens with the saved movement values.
2. Change scope (General / Trip / Asset), linked trip or asset, date, expense item, amount, payment method, notes, and line count; save and confirm the same movement serial remains.
3. Click Delete on a test expense movement and confirm the confirmation dialog appears and all lines sharing that movement group disappear after approval.
4. Confirm delete/edit are rejected for a movement linked to a closed trip until the trip is reopened.
5. Verify Desktop + Mobile and Light + Dark; no visual owner was changed.

## Modified Files
- `index.html`
- `assets/js/sea-vibe.js`
- `assets/js/sea-vibe-service.js`
- `assets/js/localization-center.js`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `package.json`

## GitHub Desktop Summary
`Fix SEA VIBE Treasury edit/delete runtime actions and restore canonical expense-scope control.`
