# SEA VIBE Duration R1 — conditional release (NOT DEPLOYED)

Baseline: ZIP 2026-10-14T232533.371. Supabase deployed definitions supplied Oct 14.

## Changes
- `assets/js/sea-vibe.js`: Khor selectable durations exactly 0.5,1,2; hide person field; 1 by default (based on previously staged UI).
- `assets/js/sea-vibe-service.js`: Khor permit zero in previews, optimistic expense and Zawel wallet; no change to fuel/commissions.
- `sql/02_GUARDED_MIGRATION.sql`: guarded transaction to change trip duration to numeric(4,1), preserve View/GRANTs, update deployed functions with exact-match replacement, explicitly block trip-type transition crossing Khor boundary (needs separate migration), exclude Khor from new permits and reconciliation, preserves fee matrix (11/12 use capped lookup at 5).

## Root Cause
INTEGER duration and 1..10 DB check, casts in sync, unconditional permit trigger, no Khor exception in Zawel preview, missing trip_type_id trigger dependency, offline optimistic permit calculation.

## Risk / scope
**HIGH**: financial triggers & dependent View. SQL has NOT been tested against a live DB in this environment. Requires DB backup, stage clone execution, compare historical 20 trip fingerprints/expenses/ledger, then controlled production maintenance window. No mid-session forced refresh. The migration refuses if trip count differs from 20; rebaseline rather than removing guard.

## Known limitations / follow-up
- Cross-type edits between Khor and fee-bearing trips are deliberately blocked to avoid unsafe retroactive refunds/charges.
- If there are more hidden dependencies or deployed definitions drifted, transaction aborts; do not use CASCADE.
- For current online and offline flows, test creating 0.5 Khor with no permit points/expenses, then 11/12 fishing/bayadah with capped permit points, and edits and reload.
- Existing third-party dependent functions may need updated return types and could block View recreation; treat as HOLD, never force.
- Database permission design: previous View grants are replayed, not broadened. SECURITY DEFINER function bodies reused.
- Validate all records of 20 legacy trips individually, not just aggregate sums.
- Source file versions: UI staged file precedes last A14 modifications but touches SEA VIBE JS only; verify against newest deployment before replacing.
