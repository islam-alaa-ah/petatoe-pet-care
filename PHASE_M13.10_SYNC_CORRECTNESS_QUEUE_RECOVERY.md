# Phase M13.10 — Sync Correctness & Queue Recovery

## Scope
This phase hardens the existing IndexedDB offline write queue without changing business rules, SQL, RLS, or screen calculations.

## Implemented
- Strict user-scoped queue namespace sourced from the offline session store.
- `user:anonymous` is rejected for every queued operation.
- Queue database upgraded to v2 with dedupe and namespace/status indexes.
- Deterministic idempotency/dedupe keys prevent duplicate local enqueue operations.
- Interrupted `processing` operations are recovered to `retry` after a safe timeout.
- Persistent retry state, exponential backoff, dependency recovery, and local/server ID mapping are preserved.
- Manual APIs added: retry, discard, list conflicts, resolve conflicts, cleanup, and detailed stats.
- Synced operation history is retained for seven days, then cleaned automatically.
- Queue recovery runs on startup, foreground, authentication restoration, and network return.

## Deliberate boundary
Database-level deletion tombstones were not introduced because the current schema uses physical deletes and has no confirmed `deleted_at` contract. Cross-device physical deletions continue to reconcile through the existing periodic full sync. Adding server tombstones requires a separately approved SQL/RLS migration and must not be simulated in frontend code.

## Version
- Version: 18.8.0
- Build: 18800
- Cache: `kyum-crm-pwa-18-8-0-m13-10`
