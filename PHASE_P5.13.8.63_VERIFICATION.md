# PETATOE — P5.13.8.63 Verification

## Release
- Version: `18.55.81`
- Build: `185581`
- Scope: Persistent customer location notes across appointment creation/editing, scheduling, and execution.

## Root Cause / Canonical Owner
The appointment flow already had canonical customer-level location defaults for neighborhood and Google Maps URL, but no dedicated persistent field for access/location notes. Existing request notes and assignment notes are appointment/visit data and cannot safely act as customer master data.

Canonical ownership introduced/extended:
- Master data: `public.customers.location_notes`
- Canonical read path: `get_customer_appointment_defaults(uuid)`
- Canonical write path: `save_customer_appointment_location_notes(uuid,text)` through `InstallationsServiceSafe`
- Appointment UI: `installations-module.js`
- Scheduling read/render: `installations-service.js` + `installation-scheduling.js`
- Execution read/render: `installations-service.js` + `installation-execution.js`
- Localization: existing `PetatoeLocalization` catalog only.

No parallel attachment, appointment, customer, or notes subsystem was created.

## What Changed
1. Added `ملاحظات الموقع / Location Notes` in Add/Edit Appointment > Customer Data.
2. The value is saved on the customer master record, not on the individual appointment.
3. Selecting the customer on a later appointment automatically reloads the latest customer-master location notes.
4. Editing an existing appointment loads the same customer-master value and permits updating/clearing it.
5. Scheduling appointment detail cards display the customer location notes.
6. Scheduling direct appointment-detail dialog displays the same value.
7. Execution > Today Requests displays the same customer location notes.
8. Execution > Current Request displays the same customer location notes.
9. The existing Google Maps action remains in its existing workflow; no map/storage/location subsystem was duplicated.

## Files Modified
- `index.html`
- `assets/js/installations-service.js`
- `assets/js/installations-module.js`
- `assets/js/installation-scheduling.js`
- `assets/js/installation-execution.js`
- `assets/js/localization-center.js`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `supabase/migrations/phase_p5_13_8_63_customer_location_notes.sql`

## SQL Required
Yes. Apply:
`supabase/migrations/phase_p5_13_8_63_customer_location_notes.sql`

The migration:
- Adds `public.customers.location_notes`.
- Adds the canonical security-definer save RPC.
- Extends the existing customer appointment defaults RPC while preserving its prior keys/behavior.
- Reloads the PostgREST schema cache.

## Regression / Verification
Passed:
- JS syntax checks for all modified JS files.
- `p5-13-4-localization-lockdown-check.mjs`: PASS.
- `p5-11-appointment-cycle-check.mjs`: 12/12 PASS.
- `p5-11-6-4-appointment-theme-schedule-view-check.mjs`: 10/10 PASS.
- `p5-11-6-5-schedule-view-direct-dialog-check.mjs`: 8/8 PASS.
- `phase-m15-11-1-execution-visit-canonicalization-check.mjs`: 13/13 PASS.
- `phase-p5-11-4-10-2-same-day-execution-group-check.mjs`: 12/12 PASS.
- Custom customer-location-notes ownership/prefill/display checks: PASS.
- UTF-8/Mojibake audit: PASS.
- Version/PWA/Service Worker parity: PASS (`18.55.81`).

Legacy `p5-11-6-3-map-action-placement-check.mjs` still contains an exact old-version assertion for `18.54.41` and old literal renderer patterns; its version/pattern failures are stale certification expectations, while current appointment-theme/direct-view and execution canonical tests pass.

## Not Touched
- Appointment services/calculations/discount/VAT logic.
- Scheduling state machine or visit allocation.
- Execution stage transitions.
- Collection/completion/invoice logic.
- Permissions/RLS policies.
- Customer raw address/neighborhood behavior.
- Mobile-specific CSS or visual layers.
- Light/Dark visual identity CSS.

## Manual Verification Required
1. Apply the SQL migration first.
2. Add a new appointment for a customer and enter `ملاحظات الموقع`; save successfully.
3. Start another new appointment for the same customer and confirm the note is prefilled automatically.
4. Modify the note and save; reopen/new appointment and confirm the new value appears.
5. Clear the note, save, and confirm it remains cleared later.
6. Scheduling: open the appointment card/details and confirm the location note appears separately from request/assignment notes.
7. Execution > Today Requests: confirm the location note appears.
8. Execution > Current Request: confirm the same note appears.
9. Verify Arabic/English switching for the new label/hint.
10. Verify Desktop + Tablet + Mobile and Light + Dark visually.

## GitHub Desktop Summary
`P5.13.8.63: add canonical customer location notes with appointment prefill and scheduling/execution visibility`
