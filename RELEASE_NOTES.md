# A17.3.8.2 — Dynamic translation correction (verified scope)

## Changes
- Fix dynamically generated A17.3.4 operations intelligence panels: headings, descriptions, detail buttons and table column headers refresh on `petatoe:language-changed`.
- Existing central translation keys reused; localization engine unchanged.
- No financial, scheduling, grouping, permissions, SQL or RPC changes.

## Audit / limits
- `node --check` passed for modified JavaScript.
- Latest known operations baseline: A17.3.8.1.
- Other module buttons that already subscribe to language events were not modified.
- Live browser English/Arabic switching and permission tests still required.
- This patch is deliberately focused on confirmed untranslated dynamic operations panel labels; it is not a certification for all free-form DB labels.
