# Phase M9.4 — Enterprise Sales Representatives Excel Import

## Root Cause
The Sales Representatives screen only supported single-record entry through the existing representative dialog. There was no Excel template, file validation, preview, chunked execution, progress feedback, or failed-row export.

## Scope
- Added Excel import and template actions to the Sales Representatives screen.
- Reused the existing `ReferenceDataService.saveRepresentative` path.
- No Supabase schema, SQL, API, permissions model, or release version changes.

## Import Columns
- كود المندوب
- اسم المندوب
- رقم الجوال
- البريد الإلكتروني
- الحالة

## Validation
- Representative code and name are required.
- Saudi mobile numbers are normalized and validated when provided.
- Email format is validated when provided.
- Status accepts Arabic or English active/inactive values.
- Duplicate code, phone, or email is rejected both within the file and against existing representatives.

## Large File Behavior
- No application row-count cap is imposed.
- Preview rendering is limited to the first 200 rows only.
- All valid rows are processed sequentially in chunks of 200.
- Progress and failed-row export remain available.
- Practical limits remain browser memory, file size, network, and Supabase service limits.

## Files Modified
- `index.html`
- `assets/js/app.js`
- `assets/js/representative-excel-center.js`
- `assets/css/style.css`

## Verification
- `node --check assets/js/app.js`: passed.
- `node --check assets/js/representative-excel-center.js`: passed.
- Required import element IDs are unique: passed.
- Existing single representative add/edit flow preserved.
