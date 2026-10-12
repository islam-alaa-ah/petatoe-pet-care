# A10 — Sales Reports Combined Visual Cleanup

## Root Cause
1. Payment-method visualization used a legend layout that stacked values and percentages in a narrow area, causing readability overlap.
2. Daily/monthly/comparison charts used static paddings and label-placement rules that were too tight for dense Arabic labels and multi-series values.
3. Comparison table change cells relied on generic styling without a guaranteed source-level hook on the actual rendered change cell.
4. Daily chart rendered only sampled day labels and relied on native SVG titles, which did not fully meet the requested UX.

## Impact
- Improves readability and visual association between values and charts.
- Clarifies period comparisons and payment-method distribution.
- Makes positive/negative change states immediately visible.
- Improves daily exploration with hover tooltip behavior.

## Scope
**In scope (Sales Reports screen only):**
- `assets/js/sales-reports.js`
- `assets/css/sales-reports.css`

**Implemented items:**
1. Converted **Sales by payment method** side panel into a compact mini-table (method / value / share) while keeping the donut chart.
2. Reworked **Monthly sales during selected year** bars so each month value is positioned above its own bar.
3. Added source-level hook `data-role="change"` and enforced **green positive / red negative / muted neutral** styling in comparison tables.
4. Increased chart left padding / guide-label offset to keep y-axis labels farther from plotted areas.
5. Reworked **Year / Quarter / Month comparison** chart dimensions and label placement to reduce collisions and keep values aligned with the correct bars.
6. Enhanced **Daily sales through month days** chart to:
   - show all day labels on the x-axis,
   - add hover/focus tooltip with day + sales value,
   - keep guide values farther from the chart.

## CSS Ownership / Cascade Audit
- Canonical owner remains: `assets/css/sales-reports.css`
- No extra override file added.
- Changes were merged into the canonical Sales Reports owner only.
- Color-state behavior for comparison tables now targets a deterministic rendered hook: `[data-role="change"]`.

## Regression Audit
Checked for:
- JS syntax validity (`node -c`) — PASS
- Static feature assertions (`tests_a10.cjs`) — PASS (20/20)
- Existing screen scope preserved: no changes outside Sales Reports assets.

## Regression Risk
- **Low** for calculations/business data because aggregation logic was not changed.
- **Medium** for UI rendering density on very narrow mobile widths because chart width/scroll behavior changed; this is mitigated by keeping overflow-x on chart containers.

## Notes
- No business logic, SQL, RLS, permissions, or unrelated screens were modified.
- Delivery includes modified files only under original paths.
