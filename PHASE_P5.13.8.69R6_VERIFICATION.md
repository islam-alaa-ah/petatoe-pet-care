# PETATOE P5.13.8.69R6 — SEA VIBE Sailing Permit Matrix

## Root Cause
- Sailing-permit reference matrix exposed SAR only while the operational Zawel deduction is points-based.
- Rows for 6–10 hours were historically stored as zero/null even though the corrected rule requires the same tariff as 5 hours for the same people count.
- Client save logic regenerated points from `15 × people × hours`, preventing the reference matrix from being a genuinely editable business source.

## Canonical Fix
- Zawel **points** are now the canonical editable value.
- SAR is derived only as `points × 575 / 2500` and rounded to 2 decimals.
- Hours `1..5` have independent editable tariffs.
- Hours `6..10` alias the 5-hour tariff for the same people count in UI, service calculation, offline state, and database trip trigger.
- Editing any cell in hours 5–10 synchronizes the full 5–10 group before save, so the user may edit any visible cell without creating conflicting tariffs.
- Existing 6–10 reference rows are normalized by the migration to the 5-hour points/SAR values.

## Examples Verified
- 5 people × 3 hours = 225 points = SAR 51.75.
- 6 people × 6 hours = 5-hour tariff = 450 points = SAR 103.50.

## Modified Files
- `assets/js/sea-vibe.js`
- `assets/js/sea-vibe-service.js`
- `assets/css/sea-vibe.css`
- `assets/js/localization-center.js`
- `supabase/migrations/phase_p5_13_8_69r6_sailing_permit_points_matrix.sql`
- `index.html`
- `version.json`
- `package.json`
- `assets/js/pwa.js`
- `service-worker.js`

## Verification
- JavaScript syntax: PASS (`sea-vibe.js`, `sea-vibe-service.js`, `localization-center.js`)
- Role-agnostic permissions: 12/12 PASS
- Permission visibility consistency: 5/5 PASS
- Mobile final certification: 21/21 PASS
- Full enterprise offline certification: PASS with the same pre-existing documented `app.js` warning
- Localization lockdown: PASS
- PWA/index version tokens unified at `18.55.96`; 0 remaining `18.55.95` tokens in `index.html`
- No new `!important` rules in SEA VIBE CSS

## Deployment
Run:
`supabase/migrations/phase_p5_13_8_69r6_sailing_permit_points_matrix.sql`

## Manual Regression Checks
1. Reference Data → Sailing Permit Fees: every cell shows points + SAR.
2. Edit 5 people / 3 hours to 225 points → SAR must show 51.75.
3. Edit any 6–10 hour cell for a people row → hours 5–10 must synchronize to the same points/SAR.
4. Create a 6-person / 6-hour trip → 450 points and SAR 103.50 must be used.
5. Confirm Zawel deduction uses the same points shown in the matrix.
6. Check Desktop/Mobile and Light/Dark layouts; horizontal scrolling remains limited to the matrix table.

## GitHub Desktop Summary
`Make SEA VIBE sailing permit points editable and canonical, show SAR per matrix cell, and apply the 5-hour tariff to trips from 6–10 hours.`
