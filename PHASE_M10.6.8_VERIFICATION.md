# Phase M10.6.8 — Customer Multi-Request Import

## Root Cause
The import preview treated every repeated phone number as a duplicate, even when the rows represented different requests for the same customer. The customer importer also had no persistent child entity for retaining multiple request numbers, so repeated rows could either be skipped or overwrite the customer's latest snapshot.

## Implemented Rule
- Same normalized phone + different request number: one customer, multiple request records.
- Same normalized phone + same request number: duplicate request and not inserted twice.
- Repeated phone without a request number: remains a duplicate because there is no secondary key to distinguish the rows.

## Modified Files
- `index.html`
- `assets/js/app.js`
- `assets/js/customer-excel-center.js`
- `assets/js/customers-service.js`
- `supabase/migrations/phase_m10_6_8_customer_multi_request_import.sql`
- `supabase/verification/phase_m10_6_8_customer_multi_request_import_verification.sql`

## Verification
1. Run the migration in Supabase SQL Editor.
2. Upload a file containing the same phone with request numbers `REQ-001` and `REQ-002`.
3. Confirm both rows are valid and the second is shown as `طلب إضافي`.
4. Confirm only one customer exists for the phone.
5. Confirm two rows exist in `public.customer_requests`.
6. Upload the same phone + `REQ-001` again and confirm it is treated as a duplicate/skipped request.
