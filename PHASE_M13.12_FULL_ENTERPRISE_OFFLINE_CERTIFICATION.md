# Phase M13.12 — Full Enterprise Offline Certification

## Baseline
Cumulative working baseline after Phase M13.11.

## Certification result
**PASS WITH DECLARED ONLINE-ONLY EXCLUSIONS**

The application runtime, registered offline domains, Smart Cache, Delta Sync, Offline Queue recovery, dashboard derivation, and remaining read-only modules pass the static enterprise certification suite.

## Certified offline flow
1. Restore the saved local session.
2. Load profile, permissions, and representative scope locally.
3. Load the application shell from Service Worker caches.
4. Read customers, followups, quotations, daily modules, and reference data from IndexedDB first.
5. Render Dashboard and Customer 360 from local state.
6. Refresh from Supabase in the background when reachable.
7. Restore and retry pending write operations using the authenticated user namespace.

## Declared Online-Only exclusions
The following sensitive or administrative operations intentionally require a live Supabase connection:
- User administration and permission changes.
- System settings, diagnostics, health checks, and backups.
- Administrative representative update/delete operations.
- Administrative reference-data writes/deletes.
- Password-protected exceptional import verification.

These exclusions do not block opening the application or reading previously synchronized commercial data offline.

## Important server limitation
Physical deletes are not available through the incremental Delta feed because the current database contract has no approved `deleted_at` tombstone field. Cross-device deletions are corrected by the periodic full reconciliation. A future server migration is required for immediate delta-delete propagation.

## Automated checks
- Enterprise architecture policy
- Offline runtime and App Shell
- Cache-first connectivity resilience
- Queue recovery and namespace isolation
- Remaining modules integration
- Dashboard offline derivation
- JavaScript syntax
- ZIP integrity

## Device acceptance scenarios still required
Static certification cannot emulate iOS/Android browser storage eviction, OS process termination, or real network transitions. Final production acceptance must include one successful online synchronization on the target device, followed by airplane-mode relaunch and data verification.
