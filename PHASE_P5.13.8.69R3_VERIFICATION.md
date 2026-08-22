# P5.13.8.69R3 — SEA VIBE Zawel Top-up Actions

## Scope
- Added Actions column to Zawel movements.
- Manual Zawel top-up rows support Edit and Delete.
- System-generated sailing-permit deduction/adjustment rows remain read-only and display as system-managed.
- Edit supports transaction date, points, notes; cash cost remains canonical at 2500 points = SAR 575.
- Delete reverses the top-up row; the Zawel balance view and treasury view recalculate automatically.

## Financial integrity guards
- Edit/Delete are online-only financial operations.
- Cannot edit/delete system-generated permit movements.
- Cannot reduce/delete a top-up if doing so would make Zawel point balance negative.
- Database RPC checks canonical seaVibeZawel edit/delete permissions.
- Treasury movement is derived from the Zawel top-up row, so edits/deletes update treasury without duplicate movement records.

## Canonical UI / Responsive
- Reuses existing SEA VIBE table, secondary buttons, form, Light/Dark and responsive owners.
- No new CSS layer and no !important overrides.
- Mobile continues using the canonical table horizontal scroll behavior.

## Modified files
- index.html
- assets/js/sea-vibe.js
- assets/js/sea-vibe-service.js
- assets/js/localization-center.js
- assets/js/pwa.js
- service-worker.js
- version.json
- package.json
- supabase/migrations/phase_p5_13_8_69r3_zawel_topup_actions.sql

## Version
- 18.55.91 — Build 185591

## Verification
- JavaScript syntax: PASS
- Role-agnostic permissions: 12/12 PASS
- Permission visibility consistency: 5/5 PASS
- Permission matrix authority: 11/11 PASS
- Permission full authority: 12/12 PASS
- Localization lockdown: PASS
- Enterprise offline compliance: PASS WITH existing documented app.js warning unrelated to SEA VIBE
- Full enterprise offline certification: PASS
- App shell / PWA version consistency: PASS at 18.55.91
- Custom Zawel R3 behavior check: PASS

## Manual verification
1. Open SEA VIBE > Zawel balance and verify Actions column.
2. Edit a top-up and change date/points/notes; verify balance, total charged points, cash cost and Treasury are recalculated.
3. Delete a top-up when enough unused points remain; verify Zawel balance and Treasury both reverse it.
4. Attempt deletion/edit that would make balance negative; it must be blocked.
5. Verify permit/permit-adjustment rows show system-managed and do not expose edit/delete.
6. Verify Desktop/Mobile and Light/Dark presentation.
