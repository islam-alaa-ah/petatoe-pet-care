# PETATOE Database Migration Manifest & Fresh Deployment Guard

Release: **18.55.67 / Build 185567**  
Phase: **P5.13.8.48**

## Certification result

The repository contains a complete, fingerprinted inventory of the historical SQL migration files, but the historical directory is **not a globally ordered migration chain** and must not be replayed alphabetically or by filename alone.

This phase therefore certifies two things:

1. **Historical migration integrity is reproducible**: every SQL file under `supabase/migrations` is listed in `supabase/migration-manifest.json` with its SHA-256 fingerprint and byte size.
2. **Unsafe fresh deployment is guarded**: the manifest explicitly blocks blind or lexicographic replay and records the known ordering hazards.

It does **not** claim that a new database can safely be reconstructed by executing every historical file in directory order. Doing so would be unsafe because multiple independent phase families coexist and filenames are not timestamped globally.

## Why filename replay is unsafe

Examples include:

- `phase_p5_13_8_11_*` sorts before `phase_p5_13_8_1_*` lexicographically.
- Independent histories coexist: `phase17_*`, `phase_m*`, `phase_p5_*`, `phase_petatoe_*`, and uppercase `PETATOE_*` files.
- Legacy aliases such as `p5113.sql` and `p5114.sql` do not encode a globally comparable deployment sequence.
- Historical migrations intentionally remain in the repository for auditability and must not be renamed after they have been applied.

## Authoritative artifacts

- Machine-readable inventory: `supabase/migration-manifest.json`
- Certification check: `scripts/phase-p5-13-8-48-migration-manifest-certification-check.mjs`
- NPM command: `npm run check:p5.13.8.48`

The manifest also records the legacy foundation bootstrap order documented by the original setup files and the explicitly certified recent P5.13.8 migration tail.

## Fresh deployment policy

For a **production-equivalent fresh environment**, use an approved production schema snapshot plus its migration ledger as the database authority. The historical `supabase/migrations` directory is an immutable audit/history inventory, not a substitute for that ledger.

Until an approved current production schema snapshot/ledger is checked into the deployment process:

- Do not run `for file in supabase/migrations/*.sql`.
- Do not use lexicographic or filesystem order as deployment order.
- Do not rename historical migrations to manufacture a new order.
- Do not delete superseded migrations; later migrations may document or replace their database definitions.
- Any newly added migration must be added to the manifest and the certification check must pass before release.

## Legacy foundation sequence

The original foundation documentation specifies this order:

1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/policies.sql`
4. `supabase/phase2_customer_followups.sql`
5. `supabase/phase3_quotations.sql`
6. `supabase/phase4_reporting_views.sql`
7. `supabase/phase5a_enterprise_foundation.sql`
8. `supabase/phase5a_verify.sql` (verification)

This sequence is retained for historical/bootstrap documentation only. It does not by itself represent the current production database schema after all later phases.

## Change-control rule for future migrations

A future migration must be append-only and narrowly scoped. Do not edit or rename a historical SQL file after release. Add the new file, update `supabase/migration-manifest.json`, run `npm run check:p5.13.8.48`, and run the relevant functional/regression checks for the affected domain.
