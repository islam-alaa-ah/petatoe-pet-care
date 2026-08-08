# Phase M10.8.9 — Customer Multi-Operation Import Validation Fix

## Root Cause

The Excel preview used the normalized customer phone alone to detect duplicates inside the uploaded file. Therefore, rows for the same customer were rejected even when the request number or quotation number represented a different sales operation.

The preview also treated an unregistered no-sale reason as a blocking validation error, although this field is optional.

## Fix

- Duplicate detection now uses the customer phone plus the operation identity.
- The operation identity consists of request number and quotation number.
- The same phone with a different request number or quotation number is accepted and linked to the existing customer.
- Only the same phone with the same request/quotation identity is rejected as an in-file duplicate.
- Rows with the same phone and no distinguishing request or quotation remain duplicates because no separate operation can be identified.
- Missing or unknown no-sale reason no longer blocks import; the value is saved as null when it cannot be resolved.
- Admin override classification no longer treats no-sale reason as a hard error.

## Verification

- `node --check assets/js/customer-excel-center.js` passed.
- `node --check assets/js/app.js` passed.
- No Supabase schema, RLS, or unrelated business logic was changed.
