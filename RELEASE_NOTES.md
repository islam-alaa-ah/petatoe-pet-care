# A17.3.9.3 — Q5 / A16 — Runtime translation fix

## Observed issue
The English view of Services Reports had 3 Arabic `بدون فاتورة` cells in the detailed sales table (411 visible text nodes audited).

## Change
- `assets/js/services-reports.js`: translate the exact canonical no-invoice marker when rendering a **sales** reference, using existing `PetatoeLocalization.t('appointments.common.noInvoice')`.
- No localization dictionary changes required. The existing English label is `No invoice`.
- Preserve raw `detailMeta.reference`, filter/search, IDs, aggregation, amounts, and CSV export content; the print view uses the rendered label.
- Existing `petatoe-language-changed` listener invokes `renderDetails()`, so labels update without refetch.

## Acceptance
- Static JS syntax check and ZIP integrity checked.
- Live English Q5 A16 rerun pending, expected 0 Arabic candidates in the same view.
- No claims on unseen/hidden rows, other tabs, or full bilingual acceptance.

## Merge safety
This file was patched from the latest assembled `services-reports.js` available to this audit. Merge the narrow `displayInvoiceReference` change with any newer production edits rather than overwriting them.
