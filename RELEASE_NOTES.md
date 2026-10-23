# A17.3.8.7 — A14 static reports i18n fix

- Converted 79 Arabic text occurrences and 67 unique phrases in the older A14 customer reports sections to `data-petatoe-i18n` keys.
- Added Arabic/English keys directly to the existing central `assets/js/localization-center.js`.
- Wrapped only the text inside `<label>` containing `<select>`; no localization attribute is placed on a control container.
- No financial logic, SQL, RLS, RPC, or permission logic altered.
- JavaScript syntax check: PASS. Static A14 coverage for this section: PASS. Live rendering and other dynamic text: PENDING.
- index.html is a complete file from the latest locally assembled audit baseline; merge if production index has newer changes.
- Also wired Reports & Analytics sidebar Customer Reports item to central localization.
