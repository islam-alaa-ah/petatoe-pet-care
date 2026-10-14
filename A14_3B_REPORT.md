# A14.3B — Customer Overview first delivery

Baseline: petatoe-pet-care-main - 2026-10-14T232533.371.zip

## Scope and ownership
- New customer overview panel embedded in existing Reports Center (`reportsOverview`) to reuse existing navigation/permission ownership. A distinct permissioned screen requires a separately approved database permission entry before it can be exposed safely.
- Modified original file: `index.html` only (HTML section + JS/CSS includes).
- New canonical owners: `assets/js/customer-reports-overview.js`, `assets/css/customer-reports-overview.css`.
- No SQL, RPC, data source or existing sales report files modified.

## Contract / reading
- Uses `CustomersService.listCustomers({force:true})` for visible master customers.
- RPC `sales_reports_rows_r44r38r20r35` with 500 row pagination, 100 page hard cap; refuses duplicate/missing row IDs or incomplete pagination.
- Enforces all sales-linked customer IDs in visible customers; if not, fails closed, no misleading numbers.
- For unique invoice counts: historical `customer_id + date + invoice_number`, current `row_id`. `cash_aggregate` excluded from identifiable invoice/buyer counts.
- Revenue includes sales with linked customer IDs only; unassigned amounts shown in separate bucket. Discounts not touched.

## Root Cause / Impact / Risk
- Historical imports are multi-line (531 invoice groups), first 1000 rows are insufficient. Independent pagination & invoice dedup required.
- New overview calculations only; all existing reports untouched.
- Regression risk medium: permissions and live customer scope need testing on multiple user roles. Old report unaffected.

## Verification
- Syntax `node --check`: PASS.
- Static view IDs and references: PASS.
- Live authorization/financial totals/mobile/English and Dark/Light: PENDING.
- Embedded panel deliberately does NOT inherit Reports Center date/representative filters: all available records scope is explicitly indicated. Filtered reporting is deferred to A14.3C.
- Customer invoice semantics for 'without invoice' need additional scope decision before counting in repeat purchases.

## Apply
Replace `index.html` and add two files in exact original paths from the archive. Open Reports Center and click `عرض / تحديث نظرة العملاء`.
