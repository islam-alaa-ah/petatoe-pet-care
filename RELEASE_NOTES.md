# PETATOE — A17.3.8.4 Service Entity Translation

## Scope
- Reuse the existing `PetatoeLocalization.entityText('service', item)` and `registerEntityCatalog({services})` from the original localization-center.js.
- Keep stable service IDs for aggregation, filters and financial reconciliation; only resolve service labels when rendering.
- A17 execution analytics: preserve catalogue service objects, translate dropdown and execution charts/tables when rendering, update on official language-change event.
- A17 financial analytics: preserve catalogue objects, register catalogue with the translation service, translate service growth/share charts and detail rows, update on official event.
- A16 service reports: keep original service catalogue and rebuild the translated name map on official language-change event; refresh reports/details without reloading financial source.

## Modified files
assets/js/advanced-analytics-services.js
assets/js/advanced-analytics-service-finance.js
assets/js/services-reports.js

## Unchanged
- No changes to localization-center.js, financial/operational data contracts, amounts, service IDs, SQL, RPC, RLS or permissions.
- Names lacking an approved English translation use the original localization-center.js's own `Translation pending` fallback; nothing was fabricated here.

## Tests
- `node --check` — PASS for all three edited files.
- ZIP integrity — PASS.
- Live browser English/Arabic toggle, A16/A17 cross-screen review, source/data permissions — PENDING.

## Deployment
Patch applies on top of the latest existing A17.3.8.3 files and A16 services report baseline. Merge if any subsequent edits touch these same files. Refresh cache/hard reload once after deployment, then test live language switching without another refresh.
