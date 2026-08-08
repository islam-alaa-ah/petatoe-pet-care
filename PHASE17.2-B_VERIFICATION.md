# Phase 17.2-B — Enterprise Route Guard

Modified files only:

- `assets/js/permissions.js`
- `assets/js/app.js`

Implemented:
- Central `authorizeView()` permission decision.
- Unknown route blocking.
- Unauthorized route blocking with safe fallback.
- Browser history/hash route protection.
- Direct navigation protection through `KYUMNavigation`.
- Automatic redirect to the first permitted screen.
- `aria-hidden` and `inert` state synchronization for inactive views.
- Unauthorized navigation event:
  - `kyum-navigation-blocked`
- Successful navigation event:
  - `kyum-view-changed`
- Unauthorized navigation items remain hidden, disabled and removed from keyboard tab order.

Verification:
- `node --check assets/js/permissions.js` passed.
- `node --check assets/js/app.js` passed.

No SQL migration is required for Phase 17.2-B.
