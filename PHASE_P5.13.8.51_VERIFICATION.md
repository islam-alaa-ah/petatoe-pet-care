# P5.13.8.51 — Invoice Conversion Value & Scheduled Date Recovery

## Root Cause

`completionList()` reused `get_installation_execution_visit_quantity_summary()` after a visit had already been confirmed. That RPC intentionally excludes the current visit from its confirmed-quantity aggregate, so a single confirmed visit returned `executed_quantity = 0` to the completion queue. The invoice conversion dialog therefore received an invoice amount of zero/empty-looking value. In same-day multi-visit groups, the grouped row also retained the first member's pre-merge invoice amount instead of recalculating from the merged quantities.

The invoice conversion dialog also defaulted `installationCompletionInvoiceDate` to `today()` rather than the scheduled appointment date carried by the completion row.

## Fix

- Completion loading now reads `executed_quantity` from the actual `installation_execution_visit_services` row for confirmed visits.
- `unit_price` is retained per `request_service_id` for deterministic value calculation.
- After same-day group merge, invoice amount and appointment expenses are recalculated from the merged/capped executed quantities.
- Invoice date defaults to `scheduledDate`; an existing report invoice date still has precedence, and the input remains editable.

## Scope

Modified runtime behavior is limited to the invoice-conversion presentation data in the Installation Completion screen. Invoice creation RPCs, stored invoice amount, VAT logic, collection, scheduling, execution stages, permissions, reports, and RLS were not changed.

## Verification

- P5.13.8.51 targeted check: 7/7 PASS
- Completion group invoice authority: 10/10 PASS
- Historical/current compatibility suite: 20/20 PASS
- Offline Runtime Reliability: PASS
- JavaScript syntax: PASS

## SQL

No SQL migration required.
