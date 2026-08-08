# Phase M13.13 — Offline Write Completion & Sync Recovery Center

## Root Cause
- Create/Update entered the Queue only when `navigator.onLine === false`.
- Weak-network failures were returned to the user without a recoverable Queue item.
- Delete operations bypassed Offline Queue.
- Queue recovery APIs existed without a visible operational center.
- Sync Engine treated `navigator.onLine` as a hard execution gate.

## Implemented
- Retryable network failures are queued for customers, followups, and quotations.
- Delete is supported as a queued action without SQL/schema changes.
- Queue handlers execute queued deletes and preserve audit/cache invalidation.
- Added Retry All and a visible Sync Recovery Center.
- Removed hard `navigator.onLine` gates from Sync Engine.
- Added automated certification.

## Deliberate limitation
Physical server deletion still has no tombstone feed. Cross-device delete discovery therefore continues to depend on periodic full reconciliation. No SQL, RLS, or schema changes were made.
