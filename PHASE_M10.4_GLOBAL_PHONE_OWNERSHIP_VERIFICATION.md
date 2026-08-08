# Phase M10.4 — Global Phone Ownership Lookup

## Scope
- Daily Operations phone lookup detects a registered number across all customer scopes.
- Duplicate-customer validation detects a registered number across all customer scopes.
- Out-of-scope users receive only the customer name, representative name, and an access warning.
- Out-of-scope users cannot open the customer record and receive no customer ID/contact details.

## Files
- `assets/js/customers-service.js`
- `assets/js/app.js`
- `supabase/migrations/phase_m10_4_global_customer_phone_ownership_lookup.sql`
- `supabase/verification/phase_m10_4_global_phone_lookup_verification.sql`

## Required deployment
Run the migration once in Supabase SQL Editor before testing the updated frontend.

## Regression boundaries
No changes to customer RLS, role permissions, data-scope assignments, database tables, or existing customer save logic.
