# P5.13.8.55 — Manual Sales Invoice

## Baseline
- Version: 18.55.72
- Build: 185572
- Official source: latest complete ZIP supplied in this chat only.

## Delivered Version
- Version: 18.55.73
- Build: 185573
- Cache token: `petatoe-pwa-18-55-73-manual-sales-invoice`

## Root Cause / Capability Gap
The canonical `sales_invoices` registry supported only `quotation` and `installation` sources. There was no canonical data model or UI path for a standalone manual invoice, no persisted manual service lines, and no reference relationship to an already invoiced appointment. Reusing an appointment or creating a fake request would have coupled manual invoices to scheduling/execution state, so the implementation adds a dedicated `manual` invoice source while preserving the existing appointment/quotation invoice workflows.

## Canonical Owners Used
- Invoice registry: `public.sales_invoices`
- Appointment service catalog: `public.installation_service_types`
- Manual invoice service lines: `public.sales_invoice_services`
- Sales invoice UI/runtime: `assets/js/sales-invoices.js`
- Sales invoice data access: `assets/js/sales-invoices-service.js`
- Sales invoice visual owner: `assets/css/sales-invoices.css`
- Localization: `assets/js/localization-center.js`

## Business Rules Implemented
1. `إضافة فاتورة` is available from Sales Invoices when the user has `salesInvoices:add` permission.
2. Source is stored as `manual` and displayed as `فاتورة يدوية / Manual Invoice`.
3. Customer is required.
4. Services come from the same active `installation_service_types` catalog used by appointments.
5. Each service has quantity and editable unit price.
6. Financial formula is identical to appointment creation:
   - subtotal before VAT
   - VAT = 15%
   - gross including VAT
   - discount is applied to VAT-inclusive gross
   - discount can be fixed amount or percentage
   - final total is stored exactly in `final_amount`
7. Payment method is required and stored on the manual invoice.
8. Optional invoice reference is an existing non-cancelled `installation` sales invoice only.
9. Reference must belong to the same selected customer.
10. Reference invoice date must be in the same year/month as the manual invoice date.
11. Changing customer/date refreshes the reference dropdown immediately.
12. The reference is informational only; it does not change appointment, visit, execution group, confirmation, collection, or original invoice state.
13. Manual invoices do not create fake appointments/visits and do not enter scheduling/execution/completion workflows.

## Database Changes
Migration required before deploying the frontend:
`supabase/migrations/phase_p5_13_8_55_manual_sales_invoice.sql`

It adds:
- `manual` to `sales_invoices.source_type`.
- Manual invoice financial/payment/reference columns.
- `sales_invoice_services` child table.
- RLS read policy for manual service lines.
- `get_manual_sales_invoice_catalog()`.
- `create_manual_sales_invoice(...)` with server-side validation of customer, services, invoice number, discount, and reference invariants.

## Files Modified
- `index.html`
- `assets/js/sales-invoices.js`
- `assets/js/sales-invoices-service.js`
- `assets/css/sales-invoices.css`
- `assets/js/localization-center.js`
- `assets/js/pwa.js`
- `assets/js/installations-service-contract.js`
- `service-worker.js`
- `version.json`
- `supabase/migrations/phase_p5_13_8_55_manual_sales_invoice.sql`
- `PHASE_P5.13.8.55_VERIFICATION.md`

## Not Touched
- Appointment creation/update RPCs.
- Scheduling logic.
- Execution group logic.
- Quantity confirmation logic.
- Completion confirmation logic.
- Existing installation invoice creation RPCs.
- Existing quotation invoice creation RPC.
- Collection workflow.
- Invoice attachment subsystem.
- Permissions architecture.
- Customer raw data.
- Service raw data.
- Mobile navigation.

## Automated Verification
- `node --check assets/js/sales-invoices.js` — PASS
- `node --check assets/js/sales-invoices-service.js` — PASS
- `node --check assets/js/localization-center.js` — PASS
- `node --check assets/js/pwa.js` — PASS
- `node --check assets/js/installations-service-contract.js` — PASS
- `node --check service-worker.js` — PASS
- `scripts/p5-13-4-localization-lockdown-check.mjs` — PASS (229 catalog keys in scope)
- UTF-8 / mojibake scan of all modified text files — PASS
- Version/cache consistency — PASS
- SQL transaction / dollar-quote structural smoke check — PASS
- Finance parity examples for fixed and percentage discounts — PASS

## Runtime / Database Verification Still Required
A live Supabase database was not available inside the execution environment, so the migration/RPC was not executed against production. Apply the migration first, then perform the manual scenarios below.

## Manual Verification Required
1. Open Sales Invoices on Desktop Light Mode and confirm `إضافة فاتورة` appears beside Refresh for a user with Add permission.
2. Repeat in Desktop Dark Mode, Tablet, and Mobile.
3. Open Add Manual Invoice and select a customer from search.
4. Confirm service dropdown contains the same active services/prices as Add Appointment.
5. Add multiple services and verify quantity, price, subtotal, VAT 15%, discount, and final total.
6. Test fixed discount and percentage discount; percentage must cap at 100% and fixed amount must not exceed VAT-inclusive gross.
7. Choose a customer with an already invoiced appointment in the same month; confirm only that customer's appointment invoices appear in Reference.
8. Confirm appointments for other customers never appear.
9. Change invoice date to another month and confirm reference choices refresh to that month only.
10. Save with no reference and confirm the invoice appears with Source = Manual Invoice and Reference = —.
11. Save with a valid reference and confirm the reference appears in the Sales Invoices table.
12. Confirm the referenced original appointment/invoice remains unchanged.
13. Confirm the manual invoice does not appear in Appointment Execution, Completion, Scheduling, or appointment-only invoice reports.
14. Switch Arabic/English while the dialog is open and confirm the new UI re-renders without reload/stuck loading.
15. Recheck one existing appointment-to-invoice flow and one quotation-to-invoice flow for regression.

## Regression Risk
- Medium: `sales_invoices` schema is extended and its source constraint is widened, but existing source values and existing invoice creation functions are not replaced.
- Low-to-Medium UI risk: one new table column increases width; mobile remains card-based and uses `data-label` rendering.
- PWA cache version is bumped so modified assets are not served from the previous cache.

## GitHub Desktop Summary
`P5.13.8.55: add manual sales invoices with appointment services, VAT/discount parity, and same-customer same-month appointment invoice reference.`
