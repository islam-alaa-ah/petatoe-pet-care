# Phase M10.8.11 — Customer Scope & Timeout Fix

## Confirmed root causes

1. `CustomersService.listCustomers()` requested 1000 records per page together with nested representative, reason, and interest relations. Under RLS and a large customer table, PostgreSQL cancelled the statement due to timeout.
2. Customer visibility depended only on database policy state. Legacy or later policies could broaden a sales representative's result set.

## Fix

- Reduced the customer page size from 1000 to 250.
- Added a frontend defense that applies `representative_id = current profile representative_id` for `sales_representative` accounts.
- A sales representative without a linked representative receives no customer rows.
- Replaced the canonical `can_access_representative()` logic so `sales_representative` is always own-data-only, regardless of any stale `access_mode = all` value.
- Removed known legacy customer policies and recreated the four canonical policies.

## Expected result

- The timeout message disappears.
- Sales representatives see only their linked representative's customers.
- Managers and super admins retain their configured scope.
