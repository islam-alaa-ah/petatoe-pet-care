# Phase 17.4-A — Daily Alerts Request Deduplication

## Confirmed Root Cause

The request initiator appeared as `performance-monitor.js` because that file wraps
`window.fetch` for measurement. It was not the source of the repeated RPC calls.

The actual repeated path was:

1. `customer-auth-ready` called `loadDailyOperations(true)`.
2. Sales representative auto-navigation called `switchView("dailyOperations")`.
3. `switchView()` called `loadDailyOperations(true)` again.
4. Every forced load called `DailyAlertsService.sync()`.
5. Repeated route/auth events could trigger additional identical RPC calls.

## Implemented

- Screen navigation now loads Daily Operations without forcing the sync RPC.
- Bootstrap remains the intentional forced sync point.
- Added one-minute per-date sync cache.
- Added in-flight request deduplication.
- Explicit forced sync remains available for:
  - initial authenticated bootstrap
  - manual Refresh Alerts button
  - post-operation refreshes when requested

## Modified Files Only

- `assets/js/app.js`
- `assets/js/daily-alerts-service.js`
- `PHASE17.4-A_VERIFICATION.md`

## Verification

After deployment:

1. Open DevTools → Network → Fetch/XHR.
2. Filter by `sync_daily_operational_alerts`.
3. Hard refresh the application.
4. Open Daily Operations several times.
5. Expected:
   - one initial HTTP 200 sync request
   - no duplicate request merely from reopening the same screen within one minute
   - manual Refresh Alerts may intentionally create a new HTTP 200 request
