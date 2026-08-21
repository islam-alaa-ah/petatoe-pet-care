# P5.13.8.56 — Manual Invoice "No Invoice" Checkbox

## Baseline
- Built directly on P5.13.8.55 / version 18.55.73 / build 185573, which was produced from the latest complete uploaded PETATOE baseline.
- New version: 18.55.74 / build 185574.

## Root Cause
The manual invoice flow introduced in P5.13.8.55 required an invoice number unconditionally, while the existing canonical `sales_invoices.is_without_invoice` behavior was already supported by appointment-generated invoices and the invoice edit flow. The manual invoice RPC did not accept or persist that canonical flag.

## Scope / Canonical Owners
- Manual invoice UI: `index.html` + `assets/css/sales-invoices.css`
- Manual invoice runtime: `assets/js/sales-invoices.js`
- Sales invoice data service: `assets/js/sales-invoices-service.js`
- Canonical localization catalog: `assets/js/localization-center.js`
- Manual invoice DB RPC: `public.create_manual_sales_invoice`
- PWA/version metadata only for cache/version rollover.

## Changes
- Added `بدون فاتورة / No invoice` checkbox directly below the manual invoice number field.
- When checked:
  - invoice number input is disabled and cleared;
  - invoice-number required marker is hidden;
  - client validation no longer requires invoice number;
  - RPC receives `p_without_invoice=true` and `p_invoice_number=null`;
  - `sales_invoices.is_without_invoice=true` is stored, reusing the existing canonical registry behavior.
- When unchecked, invoice number remains mandatory and duplicate-number validation remains active.
- No changes to services, VAT, discount, customer selection, reference filtering, execution groups, appointment workflow, or existing appointment invoice creation.
- The old P5.13.8.55 RPC signature is retained only as a thin compatibility adapter delegating to the new canonical function with `p_without_invoice=false`, so clients awaiting a safe-point update remain functional.

## SQL
Apply after P5.13.8.55:
- `supabase/migrations/phase_p5_13_8_56_manual_invoice_without_invoice.sql`

## Verification
- JavaScript syntax: PASS (`sales-invoices.js`, `sales-invoices-service.js`, `localization-center.js`, `pwa.js`).
- Unique checkbox/required-marker IDs: PASS.
- Asset cache/version references: PASS (18.55.74).
- Localization lockdown P5.13.4: PASS (229 scoped keys; English catalog Arabic leakage check PASS).
- Invoice conversion display phase 51: 7/7 PASS.
- Tax-inclusive rounded invoice phase 52: 7/7 PASS.
- Current invoice conversion certification: 8/8 PASS.
- Legacy phase 53 checker: 7 functional checks PASS; its sole version assertion is hard-coded to historical version 18.55.71 and therefore reports FAIL on the newer version. This is a stale certification gate, not a functional regression.
- Database migration could not be executed against the live Supabase environment here; live save requires applying the SQL migration first.

## Manual Verification Required
1. Open Sales Invoices > Add Manual Invoice.
2. Confirm `بدون فاتورة` appears immediately below invoice number.
3. Check it: invoice number becomes disabled/cleared and the required marker disappears.
4. Save a valid manual invoice and verify the registry shows `بدون فاتورة` while source remains `فاتورة يدوية`.
5. Uncheck it and verify invoice number becomes required again.
6. Verify same-customer + same-month reference filtering remains unchanged.
7. Verify discount amount/percentage and VAT totals remain unchanged.
8. Verify Desktop/Tablet/Mobile and Light/Dark rendering of the checkbox.

## Regression Boundaries
Not modified:
- Appointment scheduling/execution/completion state logic.
- Execution Group ownership.
- Existing appointment invoice RPCs.
- Reference filtering rules.
- Service catalog or raw Supabase service data.
- Permissions/RLS beyond the replaced manual-invoice RPC signature.
- Update safe-point behavior.

## GitHub Desktop Summary
`P5.13.8.56: add canonical No Invoice option to manual sales invoices`
