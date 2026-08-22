# P5.13.8.69R4R1 — Treasury View Column-Order Hotfix

## Root cause
`CREATE OR REPLACE VIEW public.sea_vibe_treasury_movements` inserted `movement_serial` as column #2. PostgreSQL preserves existing view column names/positions during replacement, so it interpreted column #2 as a rename of existing `movement_at` to `movement_serial` and aborted with SQLSTATE 42P16.

## Fix
Preserve the existing first eight columns in their original order and append the new R4 columns after them. The JS consumes the columns by name, so no UI behavior changes are required.

Existing order preserved:
`movement_id, movement_at, movement_type, amount, reference, description, trip_id, asset_id`

New columns appended:
`movement_serial, source_kind, source_id, expense_group_id`

## Deployment
The failed R4 script is wrapped in `BEGIN/COMMIT`, therefore PostgreSQL rolls the failed transaction back. Run the corrected R4R1 migration from the beginning; do not run the failed R4 file first.
