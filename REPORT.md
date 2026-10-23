# A14 — Customer cohort details descending inactivity sort

- Modified only `assets/js/advanced-analytics-customers.js`.
- Before pagination, sort all rows by `gapDays` descending (largest number of days without a documented sale first).
- Rows lacking a documented last sale / `gapDays = null` appear last; no artificial number is assigned.
- Stable deterministic ID tie-break. Search retains this order and “show more” reveals the next rows.
- Applies to both customer activity segments and retention cohorts through shared `openCustomerRows`.
- No changes to customer counts, retention formulas, RPC, permissions, or follow-up actions.
- Static JS syntax passed. Live browser verification pending.
