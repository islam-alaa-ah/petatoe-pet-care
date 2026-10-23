# A17.3.3.4 — Service financial comparison repair

- Adds explicit financial-only MoM (default), YoY, and equal-length previous-range selector.
- Full-year MoM and YoY service growth rankings use the most recent completed month with verified classified sales in selected year (historically July 2026), with explicit displayed periods, not a silent year-long comparison with 2025.
- Specific month respects the chosen month; no auto fallback.
- Shows current/reference classification coverage. Comparison only calculated when both periods have classified totals and a nonzero per-service reference; results concern classified sales, not total sales.
- Preserves existing temporal trend, contributions, financial RPC amounts, independent execution module, permissions, and full-width stacked layout.
- No database migrations or fabricated allocation to services.
- Static validation only, production reconciliation remains pending.
