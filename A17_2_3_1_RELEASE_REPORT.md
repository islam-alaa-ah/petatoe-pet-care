# A17.2.3.1 — Allow undated requests in operational analytics

## Confirmed live diagnostic
- 421 operational rows; 421 unique request IDs; 0 missing IDs; 0 duplicate IDs; 1 missing scheduled date; 0 invalid non-empty dates.
- Root cause: A17.2.3 previously required a valid scheduled date for **every** row and rejected the entire source on the single undated request.

## Changed files only
- `assets/js/advanced-analytics-operations.js`
- `assets/js/localization-center.js`

## Behavior
- Validate unique nonempty IDs for all rows. Reject duplicate / missing IDs.
- Preserve all source rows in memory, including records with no scheduled date.
- Do not attribute undated requests to any comparison period or car/team period chart, and do not invent a date.
- Add a localized KPI for undated requests, counted globally across the loaded report and clearly marked outside the date comparisons.
- Reject a *nonempty but invalid* date rather than silently excluding it.
- Preserve explicit failed-fetch behavior and the requirement for the original view permissions; no SQL, RLS, RPC, or A15 service changes.

## Checks
- Node JS syntax passed for both changed scripts.
- Isolated runtime test with one dated and one undated request passed: report loads, dated current count=1, undated indicator=1.
- Live deployment and production reconciliation remain pending; requested 421/420/1 distribution should be checked in real application after deployment.
- The A15 source may have its own pagination limitations; 421 rows returned in the live test alone does not certify backend completeness for every date or scope.
