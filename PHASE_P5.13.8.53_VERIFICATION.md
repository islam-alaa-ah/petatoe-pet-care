# P5.13.8.53 — Quantity Confirmation Direct Invoice Workflow

## Scope

This phase changes only the `installationCompletion` quantity-confirmation workflow and its canonical installation service adapter.

## Root cause / behavior corrected

- The confirmation modal displayed the stored collection amount with decimals and did not normalize full collection to the current VAT-inclusive final total after service edits.
- `بدون فاتورة` forced payment method to cash, overriding the payment method already stored on the appointment.
- Invoice date in the quantity-confirmation workspace defaulted to today instead of the scheduled appointment date.
- The quantity-confirmation modal had no canonical attachment input even though execution/collection evidence is already owned by `installation_execution_files`.
- Direct invoice branching already existed and was preserved: invoice number OR `بدون فاتورة` creates the invoice in the same confirmation operation; otherwise confirmation only keeps the row in Completion for later conversion.

## Implementation

- Full collection is displayed rounded to whole SAR using the current VAT-inclusive workspace total; when the displayed whole-SAR value represents full collection, the exact canonical final amount is still persisted to avoid precision drift.
- Payment method is normalized from the appointment/collection record and remains editable even when `بدون فاتورة` is selected.
- Invoice date defaults to `scheduledDate`, with today only as a fallback, and remains user-editable.
- Added up to 6 JPG/PNG/WEBP attachments beside invoice date. They are stored through the existing `installation_execution_files` owner as `file_kind='collection'` and linked to the execution visit. Failed confirmation rolls uploaded files back.
- Direct invoice behavior remains atomic at the DB RPC level for quantity + invoice creation. Confirmation without invoice data remains a separate path and reloads the Completion queue.

## Modified runtime files

- `index.html`
- `assets/css/installation-completion.css`
- `assets/js/installation-completion.js`
- `assets/js/installations-service.js`
- `assets/js/installations-service-contract.js`
- `assets/js/pwa.js`
- `service-worker.js`
- `version.json`
- `package.json`

## Test files

- `scripts/phase-p5-13-8-53-confirmation-direct-invoice-workflow-check.mjs`
- `scripts/phase-p5-13-8-52-invoice-tax-inclusive-rounded-check.mjs` (historical version assertion made forward-compatible only)

## Version

- App: `18.55.71`
- Build: `185571`

## SQL

No SQL migration is required.

## Verification

- P5.13.8.53 workflow check: **8/8 PASS**
- P5.13.8.52: **7/7 PASS**
- P5.13.8.51: **7/7 PASS**
- P5.13.8.50: **11/11 PASS**
- Completion Group Invoice Authority: **10/10 PASS**
- Appointment Financials & Multi-Schedule: **13/13 PASS**
- Same-Day Execution Group: **12/12 PASS**
- Maintenance/Cache Certification: **7/7 PASS**
- Historical/current compatibility: **20/20 PASS**
- Full Enterprise Offline Certification: **PASS WITH DECLARED ONLINE-ONLY EXCLUSIONS** (one pre-existing documented warning in `app.js`)
- JS syntax checks for modified runtime files: **PASS**

## Manual verification required

1. Open a completed visit in **تأكيد انتهاء المواعيد → تأكيد الكمية المنفذة**.
2. Confirm the collected amount is whole SAR and, for fully collected appointments, equals the rounded VAT-inclusive final total.
3. Confirm payment method is preselected from the appointment and is not changed when `بدون فاتورة` is checked.
4. Confirm invoice date defaults to the scheduled date and can be changed.
5. Add an attachment and confirm it remains visible in Completion / Sales Invoices after save.
6. Enter an invoice number and confirm quantities: the execution group must disappear from Completion and appear in Sales Invoices immediately.
7. Repeat using `بدون فاتورة`: same direct transition is expected.
8. Leave both invoice number empty and `بدون فاتورة` unchecked: quantity confirmation must complete, the row must remain in Completion, and actions must be `تحويل إلى فاتورة` + (Super Admin) `إلغاء الكمية المنفذة`.
9. Repeat steps 6–8 for a multi-visit same-day execution group and verify a single invoice is created for the group.
