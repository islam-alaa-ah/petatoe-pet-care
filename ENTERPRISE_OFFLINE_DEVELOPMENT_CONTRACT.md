# KYUM Enterprise Offline Development Contract

This contract is mandatory for every new feature, screen, entity, service, report, import, and modification after Phase M13.6.

## Canonical data path

No UI component may call Supabase directly.

All data operations must follow:

`UI → Permission Engine → Domain Service → Cache/Sync/Queue policy → Supabase`

## Mandatory classification before implementation

Every new domain must be registered in `enterprise-offline-policy.json` as exactly one of:

- `full_offline_create_update`
- `offline_read_online_write`
- `online_only_security_sensitive`
- `online_only_admin`
- `online_only_diagnostics`
- another explicitly reviewed mode

Unregistered data services are prohibited.

## Offline-readable domains

They must include:

- Smart Cache
- authenticated-user namespace
- representative/data-scope key where applicable
- TTL and stale-window policy
- cache integrity validation
- background refresh
- explicit invalidation after writes

## Mutable offline-readable domains

They must additionally include:

- Delta Sync cursor
- incremental merge by stable primary key
- overlap window
- in-flight request deduplication
- retry policy
- periodic full reconciliation when hard deletes are possible

## Offline Create/Update

They must additionally include:

- Offline Queue registration
- unique operation ID
- stable local entity ID
- dependency ordering
- online permission/session revalidation before replay
- conflict check using server version or `updated_at`
- idempotency strategy
- no automatic queueing after an ambiguous transmitted online failure

## Offline delete

Offline delete is forbidden until an approved tombstone, soft-delete, or server mutation-log design exists.

## Security-sensitive functions

Users, permissions, password reset, restore, and critical system settings remain online-only unless a separately approved security design exists.

## Reports

Reports must consume canonical service/cache data. A report may not create a parallel direct Supabase data path. Every report must display or expose freshness/source state when running from offline data.

## Imports

Imports remain online-only unless a dedicated durable batch and idempotency architecture is approved. Imports must invalidate and reconcile affected caches after success.

## Required checks before delivery

- `npm run enterprise:offline:check`
- JavaScript syntax checks
- asset and version consistency
- permission tests
- offline/reconnect runtime scenario
- sign-out/sign-in cache isolation
- scope-change cache invalidation
- queue replay and conflict scenario

## Delivery rule

A phase is not complete if it adds a data path without updating:

- `enterprise-offline-policy.json`
- this contract where necessary
- the coverage audit/certification
- runtime tests for the affected domain
