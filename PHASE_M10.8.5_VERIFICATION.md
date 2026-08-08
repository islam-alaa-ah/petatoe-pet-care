# Phase M10.8.5 — Import Override Finalization & UI Stabilization

## Root Cause

The override Edge Function previously created an authorization audit row before import, but the row was never finalized with the actual Supabase save result. The import dialog footer also used a single flex row, causing the long failed-row export button and override button to compete for space.

## Changes

- Added a finalized import result panel inside the customer import dialog.
- Split footer actions into secondary and primary groups with responsive wrapping.
- Kept the failed-row export button isolated from approval actions.
- Added explicit Supabase save totals for customers, requests/quotations, skipped rows, and failed rows.
- Extended `verify-admin-import-override` with `verify` and `finalize` actions.
- Finalized each override audit record after the import completes.
- Added persisted status/result columns to `admin_import_overrides`.
- Records failed import attempts as `failed` and partial runs as `completed_with_errors`.

## Verification

1. Run `supabase/migrations/phase_m10_8_5_import_override_finalization.sql`.
2. Redeploy Edge Function `verify-admin-import-override`.
3. Complete an override import.
4. Confirm the result panel says the data was saved in Supabase.
5. Run `supabase/verification/phase_m10_8_5_import_override_finalization_verification.sql`.
6. Confirm the latest audit row has `completed_at` and result totals.
