# SEA VIBE Duration Migration R1.2

## Root Cause
PostgreSQL rejected changing `sea_vibe_trips.duration_hours` because `trg_sea_vibe_trip_permit_expense` depends on that column. R1.1 dropped the trigger after the ALTER, too late.

## Fix
Inside the same guarded transaction, validate and drop the original trigger before the type conversion; recreate it with `trip_type_id` update coverage after modifying related functions. Abort if the trigger is missing/unexpected, or not recreated.

## Scope and Risk
Only SQL execution ordering and guard. Preserve existing 20 trips, all ledger/expense records and view permissions. PostgreSQL transactional DDL rolls back automatically on failure. The script does not automatically revalue old trips.

## Release gate
Staging backup and dry run required. Apply `01_PRE_DEPLOY_READONLY.sql`, then `02_GUARDED_MIGRATION.sql`, then `03_POST_DEPLOY_READONLY.sql`; verify historic trip financials, Zawel entries, create/update/offline flows. Production deployment remains pending until those checks pass.
