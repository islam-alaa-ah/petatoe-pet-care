# Phase M10.8.6 Verification

## Root causes fixed

1. Import preview validated rows before checking persisted request/quotation identities. Rows previously saved through the Super Admin override therefore appeared as errors again.
2. The team-summary RPC returned database-specific varchar/enum expressions while its `RETURNS TABLE` contract declared `text`, causing PostgreSQL `structure of query does not match function result type` and HTTP 400.

## Expected behavior

- Previously imported rows are detected before validation.
- They appear as `موجود` with `تم رفع هذا السجل مسبقًا`.
- They are excluded from errors, normal import, and exceptional import.
- Exact request/quotation identities are detected even for rows previously imported without a valid phone.
- The manager team summary RPC returns successfully without the console HTTP 400 error.

## Deployment

1. Upload the modified JavaScript files.
2. Run `supabase/migrations/phase_m10_8_6_existing_override_detection_and_team_summary_fix.sql`.
3. Reopen the same Excel file and verify the previously overridden rows are counted as existing.
4. Open Daily Operations as Super Admin or Sales Manager and verify the team summary loads without a console error.
