# A17.3.8.9.3 — A14 neighborhood display ambiguity guard

## Scope and source
- One changed file: `assets/js/customer-reports-overview.js`.
- Built upon `A17_3_8_9_2_A14_Geography_Stable_Grouping_Fix.zip` rather than reverting to older baseline.
- Maintains the existing `PetatoeLocalization.registerEntityCatalog` and `entityText('neighborhood')` mechanisms.

## Fixes
- Resolve geographical names using a unique exact match to the already-available neighborhood catalog (Arabic or English name).
- If the same text has multiple neighborhood identifiers, do not select an arbitrary mapping: display `Translation pending` when the UI language is English and the unresolved label is Arabic.
- If existing contact identifiers disagree for a group, treat the group as ambiguous rather than overriding the ambiguity with a name-based guess.
- Preserve the canonical geography grouping key, original customer sales records, amounts, filter values, permission checks and all RPCs.
- No SQL migration, new translation engine, or fabricated geography names.

## Important limitation
- This change only affects A14 displayed regional labels. English aliases for untranslatable free-form locations still require an approved address/locale mapping in the underlying data. English pending labels can repeat for multiple distinct original regions, but the underlying rows and arithmetic remain distinct.
- A13–A17 full translation coverage and live-language/production checks remain open.

## Static checks
- `node --check` passed.
- ZIP integrity tested.
- Manual live UI/account/DB verification NOT conducted.

## Verification on production
1. Open Customer Reports, load the overview, switch Arabic ↔ English twice without refreshing.
2. Confirm customer/sales subtotals and row count do not change.
3. Compare IDs of any `Translation pending` regions with approved neighborhood table's English names, without guessing aliases.
4. Verify filters, CSV export and the A15 car/team page remain functional.
