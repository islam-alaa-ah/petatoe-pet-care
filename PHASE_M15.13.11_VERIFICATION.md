# Phase M15.13.11 — Confirmed History + Append Reschedule Sync

## Root Cause
The rescheduling UI loaded only active visits and reduced the service totals to remaining quantity. This made the confirmed visit disappear from the scheduling dialog and forced the remaining plan to behave like a replacement plan rather than an append-only continuation.

## Fix
- `schedulePlan()` now returns confirmed visits separately with their executed quantities.
- Confirmed visits render as immutable historical rows (date/time/team/technician/confirmed quantity read-only).
- Remaining quantity is represented by one or more new editable visits appended after history.
- Only editable visits are sent to the scheduling RPC.
- The RPC accepts one new visit after confirmed execution, while initial multi-day scheduling still requires two visits.
- Confirmed visits are never deleted or rewritten.
- Confirmed visits remain visible in Installation Completion as historical confirmed rows until the request is invoiced.
- Scheduled quantities remain sourced from `installation_execution_visit_services`, so edits to the new visit are reflected when that visit later reaches quantity confirmation.

## Regression scope
No changes to customer, quotation, invoice calculation, permissions, RLS, or execution-stage transitions.
