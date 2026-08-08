# Phase M10.7.1 — Smart Refresh Engine

## Root Cause

Supabase emits `TOKEN_REFRESHED` periodically while the authenticated session is active.
The auth handler treated that background event like a fresh login and called `activate()`.
`activate()` dispatched `customer-auth-ready`, and the existing listeners then reloaded all
customers, follow-ups, quotations and Daily Operations, causing the visible page to refresh
and redraw inside the currently open screen.

A second redundant path could also occur because `signIn()` / `initialize()` call `activate()`
directly while the Supabase `SIGNED_IN` callback could activate the same user again.

## Fix

- `TOKEN_REFRESHED` now updates only the in-memory session and user token.
- It no longer dispatches `customer-auth-ready` and no longer reloads the open page.
- Duplicate `SIGNED_IN` activation is skipped when the same user is already active.
- `USER_UPDATED` still performs a full activation so profile/permissions changes remain applied.
- `SIGNED_OUT` explicitly clears the in-memory auth state.

## Scope

Modified only:

- `assets/js/auth-session.js`

No changes were made to Daily Operations business logic, Supabase queries, RLS, SQL, layout,
or the manual/targeted refresh actions that run after a user saves data.

## Verification

1. Log in and open Daily Operations.
2. Scroll to a middle section and leave the screen open beyond the Supabase token refresh cycle.
3. Confirm the page does not jump, flash, return to the top, or redraw.
4. Save a follow-up and confirm its related widgets still update normally.
5. Sign out and sign back in; confirm normal initialization and permissions still work.
