# A17.3.5 — Scheduled Appointment Peak Heatmap

- Data: authorized, unique request IDs from `InstallationsServiceSafe.operationalReport({})`; their scheduled start times from `installation_requests.scheduled_time` under existing Supabase RLS.
- No use of execution/completion times; no simulated data.
- Each request counted at most once, only when it has a valid scheduled date and a valid explicit HH:mm start time.
- Missing/invalid times displayed separately; missing dates not placed in selected dated periods.
- Includes full-width heatmap, period, 3 KPIs, 24-hour-by-7-day visualization, and expandable detail table with full-population total.
- On permission, query, or completeness failure: no partial chart shown. Must live-test `scheduled_time` column and RLS with real user.
- Database, RPCs, RLS, and financial computations untouched.
- Known existing A15 caveat: `operationalReport` implementation may not guarantee pagination for >1000 requests; source completeness must be confirmed before certification.
- Install patched `index.html`, `assets/js/advanced-analytics-peaks.js`, `assets/css/advanced-analytics.css`, and `assets/js/localization-center.js` together. `index.html` based on latest available A17.3.3.5; merge rather than overwrite if further index edits exist.
