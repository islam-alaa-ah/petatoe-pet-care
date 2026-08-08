# Phase M10.8.3 — Customer Pagination & High-Speed Import

## Root Cause

1. `CustomersService.listCustomers()` issued one Supabase select without pagination. Supabase/PostgREST returned a maximum page of 1000 records, so dashboard and customer screens stopped at exactly 1000 even when more customers existed in the database.
2. Customer import processed every Excel row sequentially. Each row could trigger several awaited network requests (customer save, interests, audit and request/quotation save), causing very long import times.

## Changes

- Added complete customer pagination in pages of 1000 until the final partial page.
- Reworked import into two controlled concurrent stages:
  - create/update each unique customer once;
  - save request/quotation rows with bounded concurrency.
- Added one authenticated-user lookup per import instead of repeating it for every row.
- Kept duplicate protection, no-phone behavior, permissions, RLS, row validation and failed-row reporting unchanged.
- Progress remains based on the number of Excel rows.

## Verification

- `node --check assets/js/customers-service.js` — passed.
- `node --check assets/js/app.js` — passed.
- Confirm that a database containing more than 1000 accessible customers displays the full count after reload.
- Import a test file and confirm that invalid and previously uploaded rows remain excluded.
- Confirm that repeated phone numbers with different request/quotation numbers create one customer and multiple linked request records.
