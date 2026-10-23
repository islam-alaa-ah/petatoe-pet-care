# A17 layout + A14 customer analytics migration

Base: 2026-10-20 01:44 full PETATOE ZIP, with successive A17.2.2.1, A17.2.2.2, A17.2.3, A17.2.3.1 overlays.

- Customer activity, retention, full segment drilldown and follow-up actions moved inside `customerReportsView`.
- Dedicated customer analytics year/month/comparison filters, independent of A17.
- Original customer RPC, follow-up service, permission checks retained; requires `customerReports` + `salesReports` to load.
- A17 no longer renders customer analytics and its panels occupy full screen width, stacked.
- No RPC, database, existing A14 analytical core, or RLS changes.
- Static checks: JS syntax and duplicate DOM IDs passed. LIVE browser and permission tests required.
