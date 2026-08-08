# Phase M9.5 — Customer Region, City & District Fields

## Scope
- Added Region, City, and District fields to customer add/edit data.
- Persisted the fields in Supabase customers records.
- Added the fields to customer details and Customer 360 exports.
- Added the fields to customer Excel export, template, parsing, and import.

## Database
Run `supabase/migrations/phase_m9_5_customer_location_fields.sql` once before using the new fields. Existing records remain valid because the new columns are optional.

## Regression Boundaries
- No changes to authentication, permissions, routing, phone uniqueness, follow-ups, quotations, or representatives.
- Existing `city` data is preserved.
- No release version change.
