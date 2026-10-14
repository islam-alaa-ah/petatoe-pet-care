# A14.3F — Customer temporal reports

Baseline: A14_3E_Geography_Contact_Actions.zip. Only the three canonical files are modified.

## Scope
- Add monthly report: unique buying customers, unique invoice keys, first **recorded** purchase within accessible data, previous-calendar-month returning customers, attributable sales.
- Add annual report: distinct annual buyers, invoice keys, first recorded buyers, attributable sales.
- New full-width stacked panels. Retain existing screens, actions, customer permissions, sales RPC and SEA VIBE unchanged.

## Data controls
- Reuse the already fully paginated verified RPC rows and CustomerService records. No extra queries.
- Distinct invoice keys: historic `(customer_id, invoice_date, invoice_number)`, current `row_id`, using original overview definitions.
- Source amounts summed in cents. Do not reattribute `cash_aggregate` or unidentified customer sales.
- Check monthly total cents equals verified attributed customer sales cents; and unique first documented buyers equals distinct recorded buyers. If not, abort all report rendering rather than show partial results.
- `first recorded` cannot be called customer acquisition. No new usage of `customers.created_at`.
- Annual customer counts are NOT additive across years.
- Monthly returning uses only truly adjacent calendar months; a gap reports `—`.

## Verification
- `node --check` PASS.
- No SQL/RPC/permission modification.
- Visual/browser and live financial checks PENDING. Regression risk medium (extra aggregates). Existing JS calculations and layout unchanged except scoped additions.
