# A17.3.8.9.4 — Centralize A17 service dynamic labels

## Scope
- Migrate five distinct display phrases from inline Arabic/English decisions to existing `PetatoeLocalization.t()` keys under `advancedAnalytics`.
- Applies to A17 execution-service and service-finance analytics (current/reference period, open period, unavailable baseline, sales unattributed).
- Re-render-on-language-change already present; retained.
- No financial allocation, counts, filters, RPC, RLS, permissions or date computations changed.
- 3 JS files; Node syntax and ZIP integrity checked.
- This package is incremental and does NOT contain A17.3.8.9.3 A14 neighborhood patch. Merge with current baseline, do not roll back later changes.

## Acceptance still pending
- Browser AR ↔ EN without refresh, permissions, totals and detail/export for A13–A17.
- Geography catalog name_en completeness / ambiguity handling.
- A15 navigation visibility and pending future dated appointments source checks.
