# PETATOE P5.13.8.69R2 — Zawel Top-up Date & Reset Hotfix

## Root Cause
The Zawel submit handler used `e.currentTarget.reset()` after an `await`. For an async event listener, `Event.currentTarget` is only guaranteed during the synchronous event-dispatch portion; after the await resumed it was `null`, producing `Cannot read properties of null (reading 'reset')` even though the top-up had already been saved.

## Fix
- Capture the form element before the asynchronous call and reset the captured reference after save.
- Add a required business date to Zawel top-up.
- Persist `transaction_date` in `sea_vibe_zawel_transactions`.
- Show the chosen business date in the Zawel movement table.
- Use the same business date for the corresponding treasury top-up movement.
- Preserve Offline Queue support by carrying `transactionDate` in the queued payload.
- Default the date using the browser local Gregorian date, avoiding UTC date rollover around midnight.

## Modified files
- `index.html`
- `assets/js/sea-vibe.js`
- `assets/js/sea-vibe-service.js`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `package.json`
- `supabase/migrations/phase_p5_13_8_69r2_zawel_topup_date_reset_hotfix.sql`

## Verification
- JavaScript syntax: PASS (`sea-vibe.js`, `sea-vibe-service.js`, `pwa.js`).
- Async reset regression check: PASS; no `e.currentTarget.reset()` remains.
- Date input + service mapping + RPC parameter: PASS.
- SQL migration contains backfill/default/not-null for `transaction_date`: PASS.
- PWA/version/cache tokens unified on `18.55.90`: PASS; 85 index cache tokens verified.
- No CSS was added or overridden; existing SEA VIBE responsive form-grid remains the visual owner for Desktop/Mobile and Light/Dark.

## SQL required
Apply:
`supabase/migrations/phase_p5_13_8_69r2_zawel_topup_date_reset_hotfix.sql`

## Manual checks
1. Open Zawel and confirm the top-up date defaults to the user's local date.
2. Charge 2,500 points and confirm no `reading 'reset'` error appears.
3. Confirm the selected date appears in the Zawel movement row.
4. Confirm the same date is used for the Zawel cash-out movement in Treasury.
5. Repeat once offline and sync after reconnecting.
6. Recheck Desktop/Mobile and Light/Dark.

## GitHub Desktop Summary
Fix Zawel async form reset and add persisted top-up transaction date with treasury/offline synchronization.
