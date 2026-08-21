# P5.13.8.67 — Canonical Discounted Values

## Root Cause
- Scheduling cards were rendering `grossServicesAmount` (VAT-inclusive before discount) instead of the canonical request `finalAmount`.
- Installation Summary service/team totals rebuilt financial value from `quantity * unitPrice * 1.15`, so request-level discounts were not represented in service totals/averages.
- Execution already consumed canonical `finalAmount`; this phase preserves that path and verifies it remains the source for Today/Current totals.

## Scope
- Scheduling: render the final VAT-inclusive amount after discount.
- Installation Summary: proportionally allocate the canonical request final amount over service values so team/service totals and averages reflect discount.
- Execution Today / Current: preserve and verify the existing canonical final-amount path.
- No SQL, schema, permission, workflow-status, invoice-RPC, or attachment changes.

## Modified files
- `assets/js/installation-scheduling.js`
- `assets/js/installations-service.js`
- `assets/js/pwa.js`
- `index.html`
- `service-worker.js`
- `version.json`

## Verification
- JavaScript syntax: PASS
- `phase-p5-11-4-10-appointment-financials-multi-schedule-check.mjs`: 13/13 PASS
- `phase-m15-10-installation-summary-execution-timeline-check.mjs`: 9/9 PASS
- `phase-m15-11-1-execution-visit-canonicalization-check.mjs`: 13/13 PASS
- `phase-p5-11-4-10-2-same-day-execution-group-check.mjs`: 12/12 PASS
- `p5-13-4-localization-lockdown-check.mjs`: PASS
- `current-invoice-conversion-certification-check.mjs`: 8/8 PASS
- Version/PWA/Service Worker consistency: PASS

## Known legacy certification note
`phase-m15-10-1-installation-summary-timeline-accuracy-check.mjs` contains a source-text assertion that specifically expects the old pre-discount formula `quantity*unitPrice*1.15`. That single assertion now fails by design because this phase replaces that formula with the canonical discounted factor. The remaining checks in that script pass.

## Manual regression checks
1. Appointment with no discount: scheduling card value remains unchanged.
2. Appointment with amount or percentage discount: scheduling card shows VAT-inclusive final value after discount.
3. Installation Summary: team/service totals and averages reflect the same discount.
4. Edit invoice service/quantity/price/discount: reopen scheduling/report and confirm values reflect reverse-synced request financials.
5. Execution > Today's Appointments and Current Appointment: displayed total remains VAT-inclusive after discount.
