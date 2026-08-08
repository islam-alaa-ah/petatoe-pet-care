# KYUM Company CRM — Enterprise Offline & Smart Sync Full Architecture Audit

## Baseline

- Baseline audited: `kyum.company-main (9)(1).zip`
- Runtime version: `18.5.0`
- Audit type: static architecture, code-path, CRUD coverage, scope isolation, and future-development governance
- Audit date: 2026-07-29

## Executive conclusion

The Enterprise Offline & Smart Sync foundation is correctly implemented for the three core commercial entities:

- Customers
- Followups
- Quotations

These three domains use user/scope-isolated Smart Cache, Delta Sync, Offline Create/Update Queue, dependency handling, cache invalidation, conflict detection, and reconciliation.

The system is **not yet fully offline across the complete program workflow**. Daily operations, alerts, suggestions, daily activity, reference-data writes, user administration, permissions, system settings, backups, diagnostics, and some direct UI data paths remain online-only. Security-sensitive administrative functions should remain online-only by policy. Operational gaps should be migrated in controlled phases.

## Root cause of incomplete full-program coverage

M13.1–M13.6 were implemented around the main commercial data cycle only. Other modules were created earlier as independent Supabase services and were not registered with Smart Cache, Delta Sync, or Offline Queue. In addition, `assets/js/app.js` still contains direct Supabase reads/writes for representatives, generic reference deletion, and daily alerts, bypassing the canonical service architecture.

## Architecture verified

### Compliant full-offline data path

`UI → Permission gate → Domain service → Smart Cache → Delta Sync → Offline Queue for supported writes → Supabase`

Verified in:

- `assets/js/customers-service.js`
- `assets/js/followups-service.js`
- `assets/js/quotations-service.js`

### Core infrastructure verified

- `assets/js/smart-cache.js`
- `assets/js/sync-engine.js`
- `assets/js/offline-queue.js`
- Correct script order before domain services and `app.js`
- User namespace and representative-scope cache separation
- Cache invalidation after successful online writes
- Server-wins conflict protection for queued updates
- Local parent dependency resolution for offline-created customers
- Full reconciliation fallback for hard deletes

## Screen and workflow coverage matrix

| Screen / workflow | Offline read | Delta sync | Offline create/update | Offline delete | Status |
|---|---:|---:|---:|---:|---|
| Dashboard | Partial through cached core arrays | Indirect | N/A | N/A | Partial |
| Customers | Yes | Yes | Yes | No | Full for approved scope |
| Followups | Yes | Yes | Yes | No | Full for approved scope |
| Quotations | Yes | Yes | Yes | No | Full for approved scope |
| Sales representatives | Cached reference read | No | No | No | Partial |
| Reference data | Yes | No | No | No | Read-only offline |
| Daily operations | No | No | No | No | Gap |
| Daily alerts | No | No | No | No | Gap |
| Daily suggestions | No | No | No | No | Gap |
| Daily activity | No | No | No | No | Gap |
| Daily performance report | Partial if core arrays already loaded | No | N/A | N/A | Partial |
| Reports center | Partial from in-memory/core cached entities | Indirect | N/A | N/A | Partial |
| Customer 360 | Partial from loaded core arrays | Indirect | N/A | N/A | Partial |
| Users | No | No | No | No | Accepted online-only |
| Permissions | No | No | No | No | Accepted online-only |
| Activity log | No | No | N/A | N/A | Accepted online-only |
| Backups/restore | No | No | No | No | Accepted online-only |
| System health/diagnostics | No | No | N/A | N/A | Accepted online-only |
| System settings | No | No | No | No | Accepted online-only |

## CRUD coverage by domain

### Customers

- Create: offline queued
- Read: Smart Cache + Delta Sync
- Update: offline queued with conflict detection
- Delete: online-only
- Import: online-only bulk workflow

### Followups

- Create: offline queued
- Read: Smart Cache + Delta Sync
- Update: offline queued with conflict detection
- Delete: online-only

### Quotations

- Create: offline queued
- Read: Smart Cache + Delta Sync
- Update: offline queued with conflict detection
- Delete: online-only

### Reference data and representatives

- Read: Smart Cache
- Create/update/delete: online-only
- Gap: writes are not routed through Offline Queue; some delete/update paths remain directly in `app.js`

### Daily workflow

- Daily task completion, targets, manager note, alert actions, suggestions, and activity sessions are online-only.
- This is the largest remaining operational gap because it affects daily field work when connectivity is unstable.

## Direct data-access findings

The audit detected 115 Supabase-related call sites across the JavaScript layer.

Most calls are correctly contained in service modules. The following direct UI paths remain in `assets/js/app.js`:

- Update sales representative
- Delete sales representative
- Generic reference-data deletion
- Direct daily-alerts read

These are documented technical debt. No new direct Supabase call may be added to UI files.

## Permission and data-scope safety

The three full-offline services preserve permission checks and calculate a cache key from the authenticated user namespace and representative scope. This prevents ordinary cache crossover between users and scoped representatives.

Required runtime tests still remain:

- Sign out user A, sign in user B on the same device, and confirm no data from A is rendered.
- Change representative access for an existing user and confirm stale scoped cache is not displayed.
- Revoke a screen/action permission while the device is offline and confirm queued writes are revalidated online before replay.

The current static implementation is architecturally sound, but these security cases require real Supabase/RLS runtime certification.

## Conflict and deletion assessment

- Update conflicts use `updated_at` and server-wins behavior.
- Hard deletes cannot be represented by Delta Sync alone because the database has no tombstone feed.
- Full reconciliation every six hours and forced refresh cover deletion eventually.
- Offline delete remains intentionally disabled.

Before offline delete is ever introduced, the database must support a tombstone, soft-delete column, or a server-side mutation log.

## Compliance assessment

### Strong areas

- Core commercial workflow architecture
- Cache isolation model
- Offline dependency ordering
- Conflict prevention
- Script loading order
- Explicit avoidance of automatic queueing after ambiguous online failures

### Gaps requiring future phases

1. Daily operations and alert actions
2. Daily suggestions and activity timeline
3. Reference data/representative write path
4. Full offline report materialization
5. Removal of direct Supabase calls from `app.js`
6. Runtime multi-user, multi-device, and RLS certification

## Final classification

- Core sales cycle: **Enterprise Offline compliant for Read/Create/Update**
- Complete program workflow: **Partially compliant**
- Security/admin workflows: **Correctly online-only by default**
- Future-development governance: **Enforced by policy registry and static compliance check added with this audit**

## Recommended roadmap

### M13.7.1 — Daily Operations Offline Integration

Add Smart Cache, Delta Sync, and Offline Queue for task completion, targets, and manager notes.

### M13.7.2 — Alerts, Suggestions & Daily Activity

Cache daily lists and queue safe action updates with idempotency keys.

### M13.7.3 — Reference Data Service Lockdown

Move remaining representative/reference CRUD out of `app.js` and keep writes online-only or explicitly queue approved changes.

### M13.7.4 — Offline Reports Materialization

Build reports strictly from cached canonical entities and expose data freshness metadata.

### M13.7.5 — Runtime Enterprise Certification

Test Android, iPhone PWA, reconnect, app restart, multi-user isolation, scope changes, two-device conflicts, RLS rejection, and long-lived queue recovery.
