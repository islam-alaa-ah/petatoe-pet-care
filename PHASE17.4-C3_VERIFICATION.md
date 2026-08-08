# Phase 17.4-C3 — Customer Excel Import Engine

## Implemented

- Added `رفع Excel` to Reference Data → Customers.
- Added import dialog with file selection and preview.
- Supports `.xlsx` and `.xls`.
- Validates before saving:
  - customer name
  - Saudi mobile number
  - customer type
  - company contact person
  - duplicate phone inside the file
  - registered representative
  - registered interest categories
  - registered no-sale reason
- Matches existing customers by normalized mobile number.
- Supports:
  - add new customers only
  - update existing and add new
  - skip existing customers
- Displays summary:
  - total rows
  - valid rows
  - invalid rows
  - new customers
  - existing customers
  - duplicates
- Displays row-level errors.
- Executes import only after a valid preview.
- Uses the existing customer service and audit logging.
- Enforces Customers Add/Edit permissions.
- Reloads customer data once after import.

## Modified / Added Files

- `index.html`
- `assets/js/app.js`
- `assets/js/customer-excel-center.js`
- `assets/js/customers-service.js`
- `assets/css/style.css`
- `templates/KYUM_Customers_Import_Template.xlsx`
- `PHASE17.4-C3_VERIFICATION.md`

## Verification

1. Open Reference Data → Customers.
2. Click `رفع Excel`.
3. Upload the C2 template.
4. Confirm preview and counters.
5. Test an invalid phone and unknown representative.
6. Confirm import remains disabled while errors exist.
7. Test `إضافة الجدد فقط`.
8. Test `تحديث الموجود وإضافة الجدد` with Edit permission.
9. Confirm customers reload after completion.
10. Confirm Audit Log contains customer insert/update entries.

## No SQL Changes

The existing unique `normalized_phone` database rule remains the final
server-side protection against duplicate customer mobile numbers.
