# Phase M10.6.9 — Quotation-Aware & No-Phone Import

## Root Cause

The customer Excel preview used the normalized phone alone whenever `requestNumber` was empty. Therefore repeated rows for the same customer were rejected even when `quotationNumber` was different. The database request table also required a request number and enforced uniqueness only on `(customer_id, request_number)`. In addition, `customers.phone` was `NOT NULL`, validated as a Saudi mobile, and covered by a global unique index, so rows marked `لا يوجد` could not be imported.

## Implemented Rules

- Same phone + different request number: accepted as an additional customer transaction.
- Same phone + different quotation number: accepted as an additional customer transaction.
- Same phone + identical request and quotation identifiers: rejected/skipped as the same imported transaction.
- `لا يوجد`, `بدون`, `N/A`, `NA`, `-`, and blank phone cells are accepted.
- Every no-phone row creates an independent customer; rows are never merged automatically by customer name.
- Existing valid phone uniqueness remains enforced through a partial unique index.

## Modified Files

- `index.html`
- `assets/js/app.js`
- `assets/js/customer-excel-center.js`
- `assets/js/customers-service.js`
- `supabase/migrations/phase_m10_6_9_quotation_and_no_phone_import.sql`
- `supabase/verification/phase_m10_6_9_quotation_and_no_phone_import_verification.sql`

## Execution

Run the migration before deploying the updated frontend files.
