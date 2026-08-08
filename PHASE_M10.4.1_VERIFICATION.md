# Phase M10.4.1 — Frontend Global Phone Lookup Activation

## Scope
- Connect Daily Operations phone lookup to `check_customer_phone_ownership` RPC.
- Reuse the same RPC before customer creation/update duplicate validation.
- Preserve data-scope restrictions when a matching customer is outside the current user's scope.

## Verified behavior
- Existing phone inside scope: customer and representative ownership are shown; Open Existing Customer remains available.
- Existing phone outside scope: customer and representative ownership are shown; out-of-scope warning is shown; customer ID and sensitive details are not exposed; Open Existing Customer is hidden.
- New phone: lookup reports that the number is not linked to a customer.
- Customer save: duplicate phone blocks the insert before Supabase customer creation.
- Edit flow: current customer ID is excluded from duplicate detection.

## Files
- `assets/js/app.js`
- `assets/js/customers-service.js`

## Verification
- `node --check assets/js/app.js`: PASS
- `node --check assets/js/customers-service.js`: PASS
- No schema, RLS, role permission, user data-scope assignment, routing, or release-version changes.
