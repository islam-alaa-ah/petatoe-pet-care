# A17.3.3.7 — Sales comparison visual clarity

- Adds a fifth column: change percentage = (current - reference) / abs(reference) × 100, using two decimals; N/A if reference is zero.
- Colors increase green and decrease red for the difference and percentage cells; unchanged stays neutral.
- Styles the total row dark blue with white text (same table-header visual family).
- Total percentage is calculated from total current and total reference, never averaged from monthly percentages.
- Labels the new heading in Arabic or English based on current localization language; preserves A17.3.3.6 year headings.
- No changes to data sourcing, calculations of source amounts, RPC, SQL, or permissions.
- Requires browser testing after deployment.
