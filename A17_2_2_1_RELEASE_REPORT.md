# A17.2.2.1 — Customer Segment Drill-down & Follow-up Integration

Baseline: petatoe-pet-care-main - 2026-10-20T014435.368.zip.

## Modified files
- index.html — adds actions column to activity breakdown and customer segment detail page inside A17.
- assets/js/advanced-analytics-customers.js — retains customer records from permission-scoped data, groups customers according to unchanged five bands, displays 10 rows with search/show-more; contact date from readable follow-up records only.
- assets/js/app.js — narrow `PetatoeA17FollowupBridge.open()` calls existing openFollowupDialog with original permission enforcement. `Contacted` only pre-populates result and completed flag; never saves without submitting original form.
- assets/js/localization-center.js — A17 bilingual keys via existing centralized registry.
- assets/css/advanced-analytics.css — styling in canonical A17 CSS owner.

## Guarantees / caveats
- No changes to source RPC, RLS, SQL, A14, A15, A16, revenue, customer classification or segmentation boundaries.
- Drilldown customers use authorized CustomersService list; linked sales from existing A17 snapshot, not guessed sales.
- Last contact fetched from FollowupsService when followups view permission is granted. Otherwise shows unavailable. The latest recorded contact date may be newer than the selected historical sales cutoff and is a current operational field.
- Calls and WhatsApp opening do not mark as contacted. Existing follow-up dialog is used for write with its own permission checks; no automatic save.
- Report table 'Sales records' indicates number of sales RPC rows (not necessarily distinct invoices), from A17's existing source.
- Current code does not create customer notes, tasks, or new schema.
- QA: JavaScript syntax checked via node --check; no authenticated production browser or permission matrix QA performed.
