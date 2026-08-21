# P5.13.8.65 — Full Sales Invoice Edit + Reverse Sync

## Baseline
Built only on the latest cumulative PETATOE baseline after P5.13.8.64 (18.55.82).

## Root Cause
Sales Invoice edit was intentionally narrow and only called `update_sales_invoice_registry_v2`, so it could update invoice number/date/no-invoice/payment only. Services, collection notes, and collection attachments remained owned by the earlier appointment/execution/completion records. That created no canonical path for a later invoice correction to propagate back to the source appointment data.

## Scope Implemented
- Expanded Sales Invoice Edit modal to show invoice/collection data, service lines, collection notes, and collection attachments.
- Add / edit / remove invoice service lines.
- Add new collection images and mark existing collection attachments for deletion.
- Manual invoices: full service/payment/notes edit stays inside the manual invoice domain.
- Installation invoices: edit reverse-syncs to `installation_request_services`, the confirmed execution group (`installation_execution_visit_services`), and `installation_request_collection` while preserving confirmed workflow status.
- Invoice number/date/no-invoice continues syncing to canonical collection/completion invoice fields.
- Recalculates request financials through the existing canonical trigger and recalculates all issued invoice groups for the same request if a shared request-service price/quantity changes.
- Added immutable revision snapshots in `sales_invoice_revision_audit`.

## Files Modified
- `index.html`
- `assets/css/sales-invoices.css`
- `assets/js/sales-invoices.js`
- `assets/js/sales-invoices-service.js`
- `assets/js/localization-center.js`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `supabase/migrations/phase_p5_13_8_65_full_invoice_edit_reverse_sync.sql`

## Database
SQL migration is required before testing the new full edit path:
`supabase/migrations/phase_p5_13_8_65_full_invoice_edit_reverse_sync.sql`

## Verification
- JS syntax checks: PASS
- Phase 65 static reverse-sync checks: 12/12 PASS
- Localization Lockdown: PASS
- Current Invoice Conversion Certification: 8/8 PASS
- Completion Group Invoice Authority: 10/10 PASS
- Completion Request-Service Identity: 11/11 PASS
- Version/PWA/Service Worker aligned to 18.55.83 / build 185583.

## Regression Guard
- No workflow status is rewound or reopened by invoice edit.
- Existing confirmed visit state remains confirmed.
- Existing execution-group identity is preserved.
- No parallel service dictionary or invoice calculation layer was introduced.
- Manual invoices remain independent of appointment/execution workflow.

## Manual Verification Required
1. Edit an installation invoice: modify quantity/price, add a service, remove a service, save, reopen invoice and the original request details.
2. Verify the linked request services and confirmed execution-group quantities reflect the invoice correction.
3. Verify payment method and collection notes update in the linked request/collection data.
4. Add a collection image, save, reopen invoice and attachments.
5. Delete an existing collection attachment and confirm it disappears after save.
6. Test a request with more than one issued execution-group invoice; confirm sibling invoice financial totals are recalculated consistently when a shared request-service price changes.
7. Confirm the request remains completed/confirmed and is not reopened into an earlier workflow stage.
8. Edit a manual invoice and verify service/payment/note changes do not create or modify an appointment.
