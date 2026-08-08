# Phase M13.14.3 — Daily Operations Permission Key Recovery

## Root Cause

The navigation and permission engine use `dailyOperations`, while `assets/js/daily-operations-service.js` requested `daily_tasks`. This allowed navigation to open but blocked the service data load.

## Changes

- Replaced the service permission key with `dailyOperations`.
- Kept permission enforcement enabled; no bypass was introduced.
- Converted the raw technical permission error into a user-facing Arabic message while retaining full console diagnostics.
- Bumped runtime asset query versions, PWA runtime version, manifest version, and Service Worker cache version to `18.12.3`.

## Unchanged

No SQL, Supabase schema, RLS, role data, business calculations, Offline Queue, Smart Cache, or Sync Engine logic was changed.
