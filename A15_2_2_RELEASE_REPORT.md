# A15.2.2 — Operational performance and centralized localization

Baseline: full `petatoe-pet-care-main - 2026-10-16T011059.232.zip` plus approved A15.2.1 patch.

Scope: added a separate appointments operational report to Cars & Teams Reports, gated by both sales report access and appointment reports access. It uses existing `InstallationsServiceSafe.operationalReport()` without new SQL/RPC, and never adds appointment revenue to sales figures. Team/vehicle assignment uses the service's canonical execution assignment snapshot fields. Status counts are appointment/request-level; executed quantities are quantities, **not distinct service types**. Average invoice is deferred until distinct invoice identity linkage is proved. Operational data explicitly loads on the user pressing Refresh Operational Metrics.

Localization: added Arabic/English default entries to the EXISTING `assets/js/localization-center.js` default rows, used the EXISTING `data-petatoe-i18n` and `PetatoeLocalization.t` APIs; routed keys to carsTeamsReports in existing routing and translation-center screen filter. No parallel translation dictionary or changes to persistence, remote overrides, language toggle, offline synchronization, SQL, or permissions.

Risk: Medium — operational report service data and cross-filtered vehicle IDs must be validated in browser. Partial source data/permission failure shows an error and no operational report. Static tests alone are not live data certification. Sales aggregate unchanged.
