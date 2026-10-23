# A17.3.8.9 — Geographic Grouping Key Stabilization (incremental patch)

## Scope
- `assets/js/customer-reports-overview.js` only, based on A17.3.8.9 previous patch.
- Fixes locale-dependent `Unspecified` geographic grouping key by using `__A14_UNSPECIFIED_REGION__` as internal stable key, rendering localized placeholder only in UI.
- Preserves raw address/region aggregation and per-customer finance sums; never translates grouping keys.
- Uses exact matching of a single neighborhood ID to a known geographic record when available; existing Arabic name fallback preserved. Does not infer location from arbitrary address text.
- Does not touch SQL, RPC, RLS, authorization, financial arithmetic, or navigation.

## Validation
- `node --check` PASS.
- ZIP integrity PASS.
- Static assertions for locale-independent grouping PASS.
- Browser UI and live customer geography catalog: NOT TESTED.
- Not a complete A13-A17 translation certificate. Other translation audit flags remain open.

## Deployment
Merge the single changed JS file with latest production if more recent than A17.3.8.9. Hard-refresh/cache-bust if service-worker caching is active. Verify geographic metrics and area grouping remain identical across Arabic ↔ English toggles.
