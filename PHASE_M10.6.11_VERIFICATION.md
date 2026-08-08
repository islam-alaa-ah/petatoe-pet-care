# Phase M10.6.11 — Account-Linked Daily Suggestions

## Root Cause

The daily generator used the account's general data-access scope. Accounts with `all` or broad selected access could therefore receive customers assigned to several sales representatives.

## Fix

- Personal daily suggestions now require an explicit `user_profiles.representative_id` link.
- Only customers whose `customers.representative_id` equals that linked representative are eligible.
- Active out-of-scope suggestions are removed once when the migration runs.
- Completed suggestion history is preserved.
- Manager team monitoring remains unchanged.
- Removed the two requested descriptive sentences from the Daily Operations UI.

## Files

- `index.html`
- `supabase/migrations/phase_m10_6_11_account_linked_suggestions.sql`
- `supabase/verification/phase_m10_6_11_account_linked_suggestions_verification.sql`
