# A4 — Sales reports presentation consolidation

## Scope
- Removed only the sales-by-invoice-status report card; the status filter and invoice status details remain.
- Consolidated display and filtering of `شبكة`, `بطاقة`, `بطاقة / شبكة`, `بطاقة/شبكة` into `بطاقة / شبكة`.
- Kept `دفع إلكتروني` and `الدفع عن طريق الموقع` separate pending live payment semantics confirmation.
- Relocated neighborhood report directly before sales detail table.

## Root cause
The report grouped `payment_method` by raw string rather than its business-equivalent category.

## Impact
Display-only grouping; values in the source rows and database are not modified. Totals conserved because every row contributes exactly once.

## Regression risk
Low for report removal/order, Medium for payment categorization pending authoritative method mapping.

## Files modified
- `index.html`
- `assets/js/sales-reports.js`

## Unchanged
SQL, RLS, permissions, financial source rows, cash_aggregate handling, CSS.

## Verification
Static source tests and JS syntax check. Live checks must compare payment totals and monthly/source reconciliation before final certification.
