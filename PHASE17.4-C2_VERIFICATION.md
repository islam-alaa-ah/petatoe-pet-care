# Phase 17.4-C2 — Customer Excel Export & Template

## Implemented

- Added `تصدير Excel` in Reference Data → Customers.
- Added `تنزيل النموذج`.
- Export respects all current customer filters.
- Export includes all approved Arabic customer columns.
- Mobile numbers and customer numbers are exported as text.
- Added workbook metadata and auto-filter.
- Added a real Excel template under:
  `templates/KYUM_Customers_Import_Template.xlsx`
- Template contains:
  - Customers sheet
  - Instructions sheet
  - customer type validation
  - text formatting for phone numbers
  - date formatting
- Buttons are protected by the Customers `export` permission.
- Added responsive action-button layout.

## Modified / Added Files

- `index.html`
- `assets/js/app.js`
- `assets/js/customer-excel-center.js`
- `assets/css/style.css`
- `templates/KYUM_Customers_Import_Template.xlsx`
- `PHASE17.4-C2_VERIFICATION.md`

## Verification

1. Open Reference Data → Customers.
2. Confirm Export and Template buttons appear only with Export permission.
3. Apply customer filters and click Export Excel.
4. Confirm only filtered rows are exported.
5. Confirm phone numbers retain leading zeroes.
6. Download the template and confirm both sheets open successfully.

## Scope

Excel import and preview are scheduled for Phase 17.4-C3.
