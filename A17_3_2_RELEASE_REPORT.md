# A17.3.2 — Sales Intelligence Visuals

- Added a full-width **monthly sales ranking** under existing sales trend chart.
- Months ranked by canonical sales-reporting RPC amounts in integer halalas; each month share and total are calculated from the same monthly snapshot, with no extra fetch.
- Excludes current and future months from ranking; explicitly says incomplete month is excluded.
- Details are expandable beneath chart, with total row; respects global year/month filters and existing view checks.
- Updated centralized translation labels in Arabic and English.
- No database, RPC, RLS, A14 customer analytics, or operating-report changes.
- `node --check` passed for both modified JS files. Live browser and permission tests pending.
- Potential source limitation: RPC completeness still depends on successful full pagination, and a selected year before available historical data is not an assurance of a complete business history.
