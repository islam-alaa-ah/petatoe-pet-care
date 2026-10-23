# A17.3.7 — Static Regression and Integration Audit (2026-10-23)

## Evidence / scope
- Reconstructed the seven A17 JavaScript modules and page from the latest A17.3.6 package and the latest targeted module patches available in this conversation.
- Node.js `--check`: PASS for all seven A17 JavaScript modules plus central localization.
- HTML DOM id duplication in the supplied A17.3.6 `index.html`: ZERO.
- Every A17 module script dependency from `index.html` is present in the merged artifact audit set.
- All literal `advancedAnalytics` t()/tr() localization keys in reconstructed A17 modules present in `assets/js/localization-center.js`.
- All literal `data-petatoe-i18n` keys under `advancedAnalytics.*` in index present in central localization catalog (100 unique keys).

## Confirmed issue and surgical fix
The A17.3.6 index still points to stale query-string versions for:
- customers A17_LAYOUT_A14MOVE -> A17_3_7_CUSTOMER_SORT (query cache token only, not a module version declaration)
- operations A17_2_3 -> A17_3_4
- services A17_3_3 -> A17_3_3_3
- service-finance A17_3_3_2 -> A17_3_3_4
This patch modifies only four cache-query tokens in `index.html` and does not change app logic or financial data. Existing file names and URL paths remain intact.

## Not certified yet
- Authenticated browser testing of mobile/desktop and Arabic/English dynamic text, year rollover, chart tooltips, visual overflow.
- Numeric reconciliation against live A13 financial RPC, A14, A15, A16, and A17 service/ops/peak chart sources.
- Role-based permissions and source pagination over the actual account, and DB backing truth of peak slots and financial coverage.
- A17.3.6 alerts only cover verified completed-year-over-year sales declines; other alert types remain unimplemented.
- Runtime deployment/cache evidence is required: query strings alone cannot guarantee installed patch JS files are the latest.

## Deployment
Replace only index.html with this patch **if** the deployed index matches the A17.3.6 baseline; otherwise merge only the four changed `?v=` query strings. Do not replace JavaScript/CSS/localization files with this ZIP. No SQL or RPC changes.

## Overall
**A17.3.7 STATIC AUDIT PASS WITH CACHE-VERSION CORRECTION; LIVE END-TO-END CERTIFICATION PENDING.**
