# SEA VIBE R1.2 — Trigger dependency order correction

Cause: R1.1 attempted `ALTER TABLE ... duration_hours TYPE numeric(4,1)` while `trg_sea_vibe_trip_permit_expense` remained attached to `duration_hours`; PostgreSQL returned `0A000` and aborted transaction.

Change: verify the enabled permit trigger, `DROP TRIGGER` transactionally **before** `ALTER TYPE`, then recreate its updated definition after function rewrites and verify it exists/enabled before COMMIT. A failed transaction restores the original trigger automatically.

Scope: only `sql/02_GUARDED_MIGRATION.sql`. No change to JavaScript, stored values, pricing, or permission logic relative to R1.1.

**Do not deploy to production without backup and successful staging rehearsal.** The script is not tested against live DB. Apply SQL before JavaScript.

Verify a rollback happened after R1.1 before trying R1.2. Existing 20 trip records, permit transaction count 20, and sum -9150 points are pre-migration anchors; run supplied 01/03 read-only checks.
