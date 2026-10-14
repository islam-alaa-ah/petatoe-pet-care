# A14.3A — Customer Reports Readiness Gate
Baseline: petatoe-pet-care-main - 2026-10-14T232533.371.zip

## Verified in static source
- Sales source is `sales_reports_rows_r44r38r20r35`, paginated using 500 rows/page with duplicate-ID checks.
- Customer master service separately paginates `customers`; it has its own access and caching path.
- Historical customer invoice identity is (customer_id, sales_date, invoice_number) and excludes cash aggregate.
- Current customer created_at reflects August–October 2026 registrations/import dates; must not be labeled first acquired customer.

## Change scope
No production file changed in this first gate. Added one standalone, read-only verification script under scripts/ for authorized browser testing. It will never attempt to patch data, authorizations, cache, or UI.

## Release blocker / prevention of previous sales-report defects
A new Customer Reports screen must not be enabled until read permissions for customers AND sales are confirmed on the same user, complete paged data is verified, and the live distinct-invoice/customer numbers are reconciled. A customer visible under one scope but not the other is not automatically an orphan. Never use a fixed 1000-row query for customer or sales KPIs.

## Next implementation once verified
Dedicated Customer Reports view with overview, purchase frequency, sales ranking, first/last observed purchase, neighborhood breakdown, scoped filters, Customer 360 navigation; reuse existing reports rather than duplicate them. Keep new permission keyed per screen, do not silently piggyback elevated sales permissions. No SQL or financial logic changes without explicit review.
