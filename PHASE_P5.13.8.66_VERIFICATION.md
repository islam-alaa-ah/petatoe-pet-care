# P5.13.8.66 Verification

## Root Cause

1. The invoice edit table referenced `appointmentNew.services.unitPrice`, but that key was absent from the canonical Localization Center defaults and DB catalog, so the raw key could render in Arabic mode.
2. The invoice edit screen exposed services but did not expose the persisted discount intent (`discount_type` / `discount_value`), even though appointment/manual-invoice financial logic already supports VAT 15% then discount on the VAT-inclusive gross.
3. The shared `sales-invoice-no-invoice` owner only defined a flex container; the checkbox itself could inherit full-width input sizing and the grid item stretched, producing an oversized/awkward “بدون فاتورة” block.

## Scope

- Sales Invoice Edit only.
- Preserve P5.13.8.65 full invoice edit and reverse synchronization.
- No workflow status rollback or unrelated business logic changes.

## Modified Owners

- `index.html`: invoice-edit financial controls/summary and cache references.
- `assets/css/sales-invoices.css`: canonical no-invoice field + invoice-edit financial layout.
- `assets/js/sales-invoices.js`: edit discount preload, calculation, validation payload.
- `assets/js/sales-invoices-service.js`: workspace discount normalization and RPC contract.
- `assets/js/localization-center.js`: canonical `appointmentNew.services.unitPrice` key.
- `supabase/migrations/phase_p5_13_8_66_invoice_edit_discount_localization_ui_hotfix.sql`: workspace discount data, full-edit RPC discount persistence/reverse sync, translation upsert.
- `version.json`, `assets/js/pwa.js`, `service-worker.js`: release/cache consistency.

## Financial Behavior

- Services subtotal.
- VAT = 15% of subtotal.
- Discount is applied after VAT, matching Add Appointment and Manual Invoice logic.
- Discount supports fixed amount or percentage.
- Installation invoice edits persist discount intent back to the canonical `installation_requests.discount_type / discount_value`, after which the existing financial trigger recalculates `discount_amount / final_amount`.
- Manual invoice edits persist discount intent directly on `sales_invoices` and recalculate manual totals.

## Verification

- Targeted Phase 66 checks: **9/9 PASS**.
- Current invoice conversion certification: **8/8 PASS**.
- Completion group invoice authority: **10/10 PASS**.
- Invoice conversion/display check: **7/7 PASS**.
- Localization lockdown: **PASS**; catalog scope increased to 242 keys during the check.
- JS syntax checks: **PASS**.
- UTF-8/mojibake scan: **PASS**.
- Version/PWA/cache consistency: **PASS**.

## SQL Required

Apply:

`supabase/migrations/phase_p5_13_8_66_invoice_edit_discount_localization_ui_hotfix.sql`

before testing the discount save/reverse-sync path.

## Manual Verification

1. Open an installation invoice and confirm “بدون فاتورة” is compact and remains on one line.
2. Confirm the service header shows `سعر الوحدة` in Arabic and `Unit Price` in English, never the raw key.
3. Confirm existing discount type/value prefill correctly.
4. Change discount as amount and percentage and verify VAT/discount/final totals update live.
5. Save an installation invoice and reopen both the invoice and related appointment data; verify discount reverse-sync is preserved.
6. Test a manual invoice edit and confirm its discount is invoice-local.
7. Verify Light/Dark and mobile layout.
