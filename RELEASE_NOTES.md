# A17.3.9.1 — Functional regression: Peak scheduling boundary

## Verified issue and code repair
`advanced-analytics-peaks.js` capped all selected periods to Riyadh **today**, even though `advanced-analytics-operations.js` scopes scheduled appointments to **end of the current month**. For October 2026, the original A17 peak range ended on October 24; this excluded valid assigned bookings scheduled later in October from peak-slot reporting. The patch brings the peak range to October 31 while maintaining a guard for wholly future periods. It does not rewrite any records or modify accounting.

## Static tests
- node --check passes for patched module, and checks on eleven A13–A17 modules were recorded in STATIC_AUDIT.json.
- Deterministic date calculation for 2026-10-24: range 2026-10-01 through 2026-10-31.
- Five top-level report nav IDs were present in the assembled `app.js` reference: salesReports, customerReports, carsTeamsReports, servicesReports, advancedAnalytics.

## Limitations / acceptance gates
- **Not production verified**: need a live A17 UI check versus operationalReport() for the chosen month, plus Q5 scheduled time distribution and unknown/outside-slot buckets.
- No claims of complete localization; direct Arabic code lines may encode business keys or user-facing literals and require per-instance review.
- Do not overwrite any newer local edits. Only the `assets/js/advanced-analytics-peaks.js` source is modified. Static audit is supporting documentation.
- The month-end semantics refer to scheduled appointments (bookings), not completed visits, invoiced revenue, or forecasts.
