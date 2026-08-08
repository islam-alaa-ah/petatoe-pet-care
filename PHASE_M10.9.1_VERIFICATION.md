# Phase M10.9.1 — Representative Reference Scope Fix

## Root Cause

The customer query already requests the embedded representative relation and maps `sales_representatives.full_name` correctly. The missing representative name was caused by the `sales_representatives` SELECT RLS policy requiring permission to open the Representatives management screen.

A sales representative could therefore read an allowed customer row while the embedded representative row was blocked by RLS. Supabase returned the customer with `representative_id`, but the embedded `representative` object was `null`, so screens and reports displayed `—`.

## Implemented Fix

- Removed all legacy SELECT policies from `public.sales_representatives` to prevent permissive-policy OR leakage.
- Added one canonical SELECT policy.
- Preserved existing Representatives-screen read access.
- Added reference read access only for representative rows allowed by `public.can_access_representative(id)`.
- Did not modify INSERT, UPDATE, or DELETE policies.
- Did not change JavaScript, report logic, UI, or business logic.

## Expected Result

After running the migration and signing out/in again, the representative name should resolve automatically in:

- Customers screen.
- New customers today.
- Daily operations reports.
- Follow-up and quotation reports that use the same embedded representative relation.
- Other customer-based reports and exports.

## Execution Order

1. Run:
   `supabase/migrations/phase_m10_9_1_representative_reference_scope_fix.sql`
2. Run:
   `supabase/verification/phase_m10_9_1_representative_reference_scope_fix_verification.sql`
3. Sign out and sign in again.
4. Open Customers and Daily Operations and confirm the representative name appears.

## Files Modified

- `supabase/migrations/phase_m10_9_1_representative_reference_scope_fix.sql`
- `supabase/verification/phase_m10_9_1_representative_reference_scope_fix_verification.sql`
- `PHASE_M10.9.1_VERIFICATION.md`
