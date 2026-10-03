# R44R38R20R34A3 — Foreground Sync Scope Guard

## Modified/New Files
- `assets/js/sync-engine.js`
- `assets/js/customers-service.js`
- `assets/js/followups-service.js`
- `assets/js/quotations-service.js`
- `assets/js/sea-vibe-service.js`
- `assets/js/sea-vibe.js`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `package.json`
- `index.html`

## Implemented
- Foreground Sync is scoped to the active screen for the affected CRM/SEA VIBE domains.
- Foreground execution is throttled to one run per entity per 30 seconds.
- SEA VIBE active sections are cleared when leaving the SEA VIBE module.
- Online/manual/offline sync paths are unchanged.
- PWA release/cache version is advanced to `18.56.138`.

# KYUM Phase 16.6 — Daily Attendance & Activity Timeline

## Modified/New Files
- `index.html`
- `assets/css/style.css`
- `assets/js/app.js`
- `assets/js/daily-activity-service.js`
- `supabase/migrations/phase16_6_daily_attendance_activity_timeline.sql`

## Implemented
- Daily employee session tracking.
- First activity, last activity and end-of-day time.
- Active, inactive and ended status.
- User-controlled end-of-day action.
- Five-minute activity heartbeat while the application is active.
- Unified timeline using existing `audit_logs`.
- Added task and alert events to the timeline.
- Employee and activity-type filters.
- Attendance summary inside the daily performance report.
- Reused existing audit infrastructure instead of duplicating business events.
