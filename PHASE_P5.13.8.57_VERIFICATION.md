# P5.13.8.57 — Sales Invoice Loading Regression Hotfix

## Baseline
- Built directly on P5.13.8.56 / version 18.55.74 / build 185574, itself based on the latest complete PETATOE baseline supplied in this chat.
- Delivered version: 18.55.75 / build 185575.

## Root Cause
Two regressions were isolated to the latest manual-invoice changes:

1. `SalesInvoicesService.list()` embedded a self-relation in the PostgREST select string:
   `reference_invoice:sales_invoices!sales_invoices_reference_sales_invoice_id_fkey(...)`.
   The live PostgREST schema cache could not resolve that `sales_invoices -> sales_invoices` relationship, so the primary invoice-list request failed before any rows were rendered. This caused the whole Sales Invoices screen to show zero values/loading and the error `Could not find a relationship between 'sales_invoices' and 'sales_invoices' in the schema cache`.

2. The manual `بدون فاتورة` checkbox inherited the global `input{width:100%}` and label sizing behavior. The checkbox row therefore consumed the field width and the text wrapped vertically instead of staying as a compact row below invoice number.

## Canonical Owners
- Sales invoice read/data access: `assets/js/sales-invoices-service.js`
- Manual invoice visual owner: `assets/css/sales-invoices.css`
- Asset version references: `index.html`
- PWA/cache version owners: `assets/js/pwa.js`, `service-worker.js`, `version.json`

## Fix Implemented
### Invoice loading
- Removed the PostgREST embedded self-relation from the main `sales_invoices` query.
- Kept `reference_sales_invoice_id` in the canonical invoice row.
- Collects the referenced invoice IDs after the main list succeeds.
- Fetches only those referenced invoice rows with a second direct `sales_invoices` query using `.in('id', referenceIds)`.
- Merges the reference row into the existing normalized invoice model before rendering.
- This preserves the manual invoice reference feature without depending on PostgREST relationship discovery/schema-cache FK metadata.

### `بدون فاتورة` layout
- Updated the existing P5.13.8.56 canonical rule instead of adding another override layer.
- Checkbox gets intrinsic width (`width:auto`) instead of inheriting global 100% input width.
- Label remains inline-flex and the text uses `white-space:nowrap` so `بدون فاتورة` remains on one line under invoice number.
- No IDs, event handlers, validation, or save behavior were changed.

## Files Modified
- `index.html`
- `assets/js/sales-invoices-service.js`
- `assets/css/sales-invoices.css`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `PHASE_P5.13.8.57_VERIFICATION.md`

## Functions / Selectors Modified
- `SalesInvoicesService.list()`
- `.manual-sales-invoice-number-field`
- `.manual-sales-invoice-no-invoice`
- `.manual-sales-invoice-no-invoice input[type="checkbox"]`
- `.manual-sales-invoice-no-invoice span`

## Not Touched
- Manual invoice create RPC.
- P5.13.8.55 / P5.13.8.56 SQL migrations.
- Customer/month reference eligibility rules.
- Manual services, VAT, discount, totals, payment, or notes logic.
- Appointment scheduling/execution/completion.
- Execution Group logic.
- Existing installation/quotation invoice creation RPCs.
- Permissions/RLS.
- Localization catalog/content.
- Attachment workflow.

## SQL
- No new SQL is required for this hotfix.
- Existing P5.13.8.55 and P5.13.8.56 migrations remain required for the manual invoice feature itself.

## Automated Verification
- `node --check assets/js/sales-invoices-service.js` — PASS
- `node --check assets/js/sales-invoices.js` — PASS
- `node --check assets/js/pwa.js` — PASS
- `node --check service-worker.js` — PASS
- P5.13.4 localization lockdown — PASS (229 scoped keys)
- Self-relation select scan — PASS (removed from SalesInvoicesService)
- Reference direct-query/merge structural checks — PASS
- CSS brace balance — PASS (76/76)
- Checkbox intrinsic-width + single-line structural checks — PASS
- UTF-8 / mojibake scan for all modified text files — PASS
- Version/cache consistency — PASS (18.55.75 / 185575)

## Manual Verification Required
1. Reload/navigate to Sales Invoices after deploying the phase and verify the existing invoices load normally again (the previous 49 rows/count should return according to live data and filters).
2. Verify the schema-cache relationship error no longer appears.
3. Open Add Manual Invoice and confirm `بدون فاتورة` is directly below invoice number on one line.
4. Check/uncheck `بدون فاتورة` and confirm invoice-number required/disabled behavior remains unchanged.
5. Select a customer/date and confirm manual invoice Reference still lists only that customer's already-invoiced appointments in the same month.
6. Open an existing manual invoice/reference row and verify the Reference column still renders correctly.
7. Verify Light/Dark plus Desktop/Tablet/Mobile for the checkbox area.
8. Recheck one existing appointment invoice to ensure normal invoice loading/payment/attachment data remains unchanged.

## Regression Risk
- Low: the hotfix removes a fragile embedded self-relation and replaces it with an explicit second read only when reference IDs exist.
- Low UI risk: only the existing canonical checkbox rule was corrected; no general form styles were altered.

## GitHub Desktop Summary
`P5.13.8.57: fix Sales Invoices schema-cache self-relation regression and manual No Invoice checkbox wrapping`
