# A17.3.6 — Balanced Insights and Central Translation Coverage

## Scope
- Add read-only sales alert to A17 insights panel based on verified and fully loaded canonical sales RPC snapshot.
- For completed selected calendar months only, compare same month preceding year; alert on decline >=15% and baseline >=SAR 1,000.
- No alert for current/incomplete months or absent/unverified comparable month.
- Show year/month and current/reference amounts, rate, and reason. Expandable details table; full width.
- Requires advancedAnalytics + salesReports permissions, no new RPC / SQL / RLS, no automatic notifications.
- Preserve existing A14 customer reports and A17 services/ops/peak features.
- Extend centralized localization for all introduced A17.3.6 strings; static HTML and literal dynamic localization-key audit found no missing keys across current A14–A17 modules sampled.

## Validation
- node --check on changed JS scripts: PASS.
- HTML key coverage of recent A14/A15/A16/A17 scopes: PASS.
- JS direct-literal dynamic key coverage of most recent modules: PASS.
- Full authenticated production/browser/live-data verification: PENDING.
- Alerts for retention, operational load, services and peak load are intentionally NOT inferred until their own completed sources and sample-size rules are validated.

## Baseline and rollout
- Built from locally available A17.3.5 index and latest A17.3.5.1 hour-slot patch, plus A17.3.3.8 sales table stylesheet alignment patch.
- Existing index.html and central localization files can have separate later changes; compare/diff before replacing, do not overwrite newer changes.
