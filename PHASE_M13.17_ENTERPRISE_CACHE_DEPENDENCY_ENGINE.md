# Phase M13.17 — Enterprise Cache Dependency Engine

## Root Cause
Derived daily reports used independent offline-read snapshots. Write services invalidated only their own entity caches, so customers, followups, quotations, tasks, alerts, targets, manager notes, and daily suggestions could leave dependent reports stale.

## Implementation
- Added `assets/js/cache-dependency-engine.js` with a centralized entity-to-cache dependency map.
- Connected online and offline-queue writes for customers, followups, and quotations.
- Connected daily task completions, targets, manager notes, alerts, and suggestion completion.
- Added a debounced UI listener that refreshes only visible affected reports and dashboard summaries.
- Registered the engine in the PWA app shell.

## Dependency Coverage
- customers → daily performance, activity, suggestions, team suggestions, alerts
- followups → daily performance, activity, suggestions, team suggestions, alerts
- quotations → daily performance, activity, alerts
- daily task completions → daily performance, activity
- daily targets → daily performance
- manager notes → daily performance, activity
- daily alerts → alerts, activity
- daily suggestions → suggestions, team suggestions, activity

## Release
- Version: 18.15.0
- Build: 181500
- Cache: kyum-crm-pwa-18-15-0-m13-17

## Validation
- JavaScript syntax: PASS
- Enterprise Offline Compliance: PASS WITH 1 pre-existing documented warning
- Dashboard Offline Certification: PASS
- Offline Runtime Reliability: PASS
- Cache-first Certification: 15/15 PASS
- Queue Recovery: 13/13 PASS
- Remaining Modules Offline Integration: PASS
- Full Enterprise Offline Certification: PASS WITH DECLARED ONLINE-ONLY EXCLUSIONS
- Offline Write Completion: 10/10 PASS
