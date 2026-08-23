# P5.13.8.70R3 — Vehicle Treasury Invoice Display Reference

## Root Cause
The Vehicle Treasury workspace exposed `sales_invoices.invoice_number` directly as the movement `reference`. Historical/without-invoice rows persist internal `NOINV-*` identifiers to satisfy database uniqueness/NOT NULL requirements, so those technical IDs leaked into the user-facing treasury table. The workspace also only selected `source_type='installation'`, so referenced manual cash invoices had no vehicle-treasury representation even though the manual invoice reference already identifies the appointment whose team/car owns the cash movement.

## Canonical fix
- `get_vehicle_treasury_workspace()` remains the single financial read owner for Vehicle Treasury.
- Installation cash invoice display:
  - real numbered invoice -> displays `invoice_number`;
  - without-invoice / internal `NOINV-*` -> displays `بدون فاتورة` and never exposes the technical key.
- Manual cash invoice display:
  - only manual invoices with a valid `reference_sales_invoice_id` to an issued installation invoice are included;
  - the owning car/team is resolved from that reference appointment;
  - the displayed reference is the referenced appointment invoice number, falling back to its request number when it is a without-invoice reference.
- Manual invoices without an appointment reference remain outside Vehicle Treasury because there is no canonical car/team ownership.
- Internal `NOINV-*` values are preserved in the database for integrity and are not rewritten.

## UI / Localization
`vehicleTreasury.col.reference` is now:
- Arabic: `رقم الفاتورة / المرجع`
- English: `Invoice No. / Reference`

The prior P5.13.8.70R2 localization additions are preserved in the delivered localization owner.

## Scope / modified owners
- `supabase/migrations/phase_p5_13_8_70r3_vehicle_treasury_invoice_display_reference.sql`
- `assets/js/localization-center.js`
- `index.html`
- `assets/js/pwa.js`
- `service-worker.js`
- `package.json`
- `version.json`

No CSS, expense write RPC, permission, RLS, vehicle-scope, invoice calculation, VAT/discount, or SEA VIBE logic changed.

## Version
- Application: `18.55.98`
- Build: `185598`
- Cache: `petatoe-pwa-18-55-98-vehicle-treasury-reference-p5-13-8-70r3`

## Verification
- JavaScript syntax: PASS (`localization-center.js`, `pwa.js`)
- Role-agnostic permissions: 12/12 PASS
- Permission visibility consistency: 5/5 PASS
- Mobile final certification: 21/21 PASS
- Full enterprise offline certification: PASS with the existing documented unrelated `app.js` warning
- Localization lockdown: PASS; English catalog has no Arabic leakage
- Version/package/PWA/service-worker consistency: PASS
- Local CSS/JS cache tokens unified to 18.55.98: PASS
- `NOINV-*` suppression is implemented only at display/reference projection; stored invoice keys are untouched.

## Manual verification after SQL
1. Open Vehicle Treasury for a car with a normal numbered cash appointment invoice: the column must show the actual invoice number.
2. Open a cash appointment marked "بدون فاتورة": the column must show `بدون فاتورة`, never `NOINV-*`.
3. Create/find a manual cash invoice with an appointment reference: it must appear in the treasury of the referenced appointment's car/team and show that invoice reference.
4. Verify totals before/after: only newly eligible referenced manual cash invoices may add to treasury revenue; existing installation invoice values remain unchanged.
5. Verify Arabic/English and Desktop/Mobile header text.

## GitHub Desktop summary
`Fix Vehicle Treasury invoice/reference display, hide internal NOINV identifiers, and attribute referenced manual cash invoices to the correct vehicle.`
