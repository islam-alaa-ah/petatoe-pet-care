# A14.4.1 — Full filtered customer-detail CSV export

## Baseline
A14_Financial_Reconciliation_Fix.zip (latest available modified release, after A14.3G.3). Financial reconciliation LIVE PASS as reported by user for 3,540 sales rows, 22 months, SAR 1,328,767.80, zero issues.

## Root Cause
The CSV exporter reads `a14DetailRows` from the DOM, but `renderCustomerDetails()` intentionally renders only the first `detailVisible` (10 initially) filtered customers. Hence customer-detail CSV was incomplete until manually expanding all records.

## Scope and modification
**Only:** `assets/js/customer-reports-overview.js`, `exportCsv()`.
- Remove detail table from the DOM-export sections array.
- Append customer-detail section from `filteredResult.ranks` (complete calculated permission-scoped filtered snapshot).
- Keep same five column headers, number formatting and CSV escaping, and permissions checks.
- Existing other sections remain DOM-sourced and retain existing semantics (e.g. top 10 intentionally top 10).
- No SQL, RPC, CSS, HTML, pagination, financial calculations or permission engine changes.

## Tests
- `node --check`: PASS.
- Mock export: 23 filtered customer rows => 23 CSV customer rows despite 10 visible: PASS.
- Export is blocked when report permissions denied: PASS.
- CSV UTF-8 BOM and value formatting retained: PASS.
- Browser / production export with real accounts and filters: PENDING.

## Impact / Regression Risk
Low for the single scoped CSV fix. CSV detail now always includes every customer in the currently filtered calculation; exported files may be longer, matching intended scope. The preexisting report-wide `window.print()` may print only the first 10 detail rows and remains a separate PENDING defect. Other sections in CSV may be intentionally limited by their UI design. No claim of full A14.4 certification.

## Next live gate
After replacing the JS file, open customer reports, load data and keep full scope. Export CSV without using Show More, verify detail section row count equals the complete filtered customer count shown in the detail status, verify total per-customer amounts against the corresponding linked-customer KPI. Repeat with year/month/customer/neighborhood filters, and test read-only access for restricted roles. Independently fix/check print/PDF output before closing A14.4.
