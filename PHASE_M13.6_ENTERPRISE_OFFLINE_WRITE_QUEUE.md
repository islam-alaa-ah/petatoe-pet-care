# Phase M13.6 — Enterprise Offline Write Queue & Conflict Resolution

## Baseline
Cumulative KYUM CRM tree after Phase M13.5.

## Root Cause
The M13.1–M13.5 architecture provided persistent read caches and delta synchronization, but every create/update still depended on an active network connection. A lost connection before submission prevented the operation from being recorded locally. Retrying writes after an uncertain online failure was unsafe because the server might already have committed the request, causing duplicate records.

## Implementation
- Added `assets/js/offline-queue.js` using a dedicated IndexedDB database.
- Queue is isolated by authenticated user namespace.
- Supported queued actions:
  - customers: create/update
  - followups: create/update
  - quotations: create/update
- Offline delete remains intentionally unsupported.
- Operations receive unique IDs, local entity IDs, timestamps, dependency metadata, attempt counters and status.
- Queue processing runs after connectivity restoration, app foregrounding and initial startup.
- Processing is sequential to preserve operation order.
- Follow-ups and quotations created against an unsynced local customer wait for the customer operation, then resolve the server ID through the local-to-server ID map.
- Successful operations trigger the existing Delta Sync Engine.
- Retryable failures use exponential backoff with a maximum of eight attempts.

## Conflict Policy
For queued updates, the original `updatedAt` value is captured from the cached record. Before replay, the service reads the current server `updated_at` value.

If the server record is newer than the queued base version:
- the queued write is not applied;
- the operation status becomes `conflict`;
- the local payload is retained in the conflicts store;
- the server remains the authoritative version.

## Duplicate Protection
An operation is queued automatically only when the browser is already offline before the write begins. An online request that fails after transmission starts is not automatically queued, because the server may already have committed it.

## Scope Protection
No changes were made to:
- SQL
- Supabase schema
- RLS
- Permission Engine rules
- delete behavior
- import/export business logic

## Version
- Version: 18.5.0
- Build: 18500
- Service Worker cache: `kyum-crm-pwa-18-5-0-m13-6`

## Runtime Limitation
Certification is static. Real-device testing is still required for offline submission, browser termination/restart, connectivity restoration, authenticated replay, conflict creation and Supabase responses.
