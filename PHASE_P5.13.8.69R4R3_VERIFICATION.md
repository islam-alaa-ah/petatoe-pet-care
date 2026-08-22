# P5.13.8.69R4R3 — SEA VIBE Expense Edit In-Place Recovery

## Root Cause
The expense edit workflow relied on transient JavaScript variables (`editingExpenseGroupId` / `expenseReturnView`) to decide whether form submit should call the update RPC or the add RPC. During view activation/navigation that transient state could be cleared while the edit form remained populated. The next submit therefore executed `addExpenses()` and created a new treasury movement, leaving the original movement unchanged.

## Fix
- Added hidden canonical edit-state fields to the existing expense form: `seaVibeExpenseMovementGroupId` and `seaVibeExpenseReturnView`.
- Added `setExpenseEditingState()` and `currentExpenseEditingState()` in the existing SEA VIBE UI owner.
- Edit load now persists movement identity in the form itself.
- Submit now resolves edit identity from the form and always calls `SeaVibeService.updateExpenseMovement()` when an existing movement is being edited.
- Successful update clears edit state only after the update RPC completes.
- No SQL change and no new CSS layer.
- Existing RPC keeps the same `movement_group_id` and `movement_serial`, updates existing lines in place, inserts only genuinely new lines, and removes deleted lines from the same movement.

## Modified Files
- `index.html`
- `assets/js/sea-vibe.js`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `package.json`

## Version
- 18.55.94 / build 185594

## Verification
- `node --check assets/js/sea-vibe.js` — PASS
- `node --check assets/js/sea-vibe-service.js` — PASS
- Role-agnostic permissions — 12/12 PASS
- Permission visibility consistency — 5/5 PASS
- Mobile final certification — 21/21 PASS
- Full Enterprise Offline Certification — PASS (existing documented app.js warning only)
- 85 local CSS/JS version tokens unified on 18.55.94

## Manual Regression Test
1. From SEA VIBE Treasury, choose an existing expense movement and press Edit.
2. Change amount/date/expense/trip or add/remove a line.
3. Save.
4. Confirm the original movement serial remains unchanged.
5. Confirm no second treasury movement is created.
6. Confirm the old values disappear and the same movement reflects the new values.
7. Test delete on a disposable movement and confirm all lines in that movement are removed once.
