# A14.3G.1 — Customer Reports Filters & Export

## Scope
- Independent customer reports screen; no change to central reporting / sales / SEA VIBE / SQL / RPC.
- Filter Year, Month, and Customer across all customer KPIs and panels using the *completed* paginated RPC and CustomersService snapshots, with no per-filter partial fetch.
- Reset filters; CSV export of all currently displayed report tables, and browser print/save-to-PDF.
- All report panels remain stacked and full-width.

## Integrity design
- Existing complete paging (500, unique row IDs) remains; verifiedSnapshot only set after fetch and calculation succeed.
- Recalculation via `calculate()` validates no out-of-scope customer IDs and prevents partial results on errors.
- Export buttons disabled until successful scoped calculation; permissions rechecked when exporting.
- CSV UTF-8 BOM for Excel, protects spreadsheet formula injection; does not persist financial data.
- No new SQL, policies, or external dependencies. No forced refresh during use.

## Restrictions / follow-up
- CSV is CSV opened by Excel, **not** native XLSX.
- PDF uses the browser's Print / Save as PDF, **not** a generated PDF library.
- Filters for representative and neighborhood need a verified source field/permission contract before implementation (do not infer from loose address strings).
- Detailed client-wise export is currently limited to existing Top 10 and other visible tables; full customer detail and Customer 360 deep links require a separately tested integration.
- Live browser checks on light/dark/mobile and permissions are still pending.

## Root cause / impact / regression risk
- Gap: A14.3F had no screen-wide scoped filters or export controls.
- Impact: All customer KPI definitions recalculated on the selected sale date and/or customer; the eligible customer master count stays full-scope except when the specific client is chosen. First recorded sale is within selected source scope.
- Scope: index.html, dedicated screen JS/CSS only; no other files.
- Regression risk: Medium. Validate all-years reset equals A14.3F totals and monthly/annual partition; no stale data or export after failure.
