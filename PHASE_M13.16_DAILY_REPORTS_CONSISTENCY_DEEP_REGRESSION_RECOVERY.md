# Phase M13.16 — Daily Reports Consistency & Deep Regression Recovery

## Root Cause
Daily task writes updated the task completion cache only. Derived offline-read caches for daily performance and daily activity were not invalidated, force refresh was not passed to the performance service, and background cache refresh events had no UI listener.

## Changes
- Pass `{ force }` to `DailyPerformanceService.loadReport`.
- Invalidate `daily-performance:<date>` and `daily-activity:<date>` after online and queued task writes.
- Refresh the visible daily performance report after task updates.
- Listen for `kyum-offline-read-updated` and apply refreshed performance/activity snapshots.
- Add retryable weak-network fallback to Offline Queue for task state writes.
- Register WhatsApp template service as an accepted online-only user media settings domain.
- Unify application, package, runtime and service-worker versions at 18.14.0.
- Make the offline write certification version check dynamic.

## Unchanged
No SQL, RLS, report formulas, permissions, customer selection logic, or UI redesign changes.
