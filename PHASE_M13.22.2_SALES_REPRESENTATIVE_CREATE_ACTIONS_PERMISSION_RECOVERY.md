# Phase M13.22.2 — Sales Representative Create Actions Permission Recovery

## Root Cause

The current UI and services use action-level permissions. The sales representative could view Customers and Quotations, but `can_add` could be missing/disabled in the deployed `role_screen_permissions` rows. In addition, the main Customers screen displayed its Add Customer button using the `customers.edit` check instead of the canonical `customers.add` check, creating inconsistent behavior between screens and roles.

## Fix

- The Customers Add button now checks `customers.add`.
- The Quotations Add button continues to check `quotations.add`.
- A safe SQL migration restores `can_view` and `can_add` for the `sales_representative` role on Customers and Quotations while preserving all other customized action fields.
- Runtime, service worker, and asset versions are unified at 18.18.2.

## Required Deployment Step

Run:

`supabase/migrations/phase_m13_22_2_sales_representative_create_actions_permission_recovery.sql`

Then sign out and sign back in (or clear only the saved permission session) so the account reloads the updated permission rows.

## Scope Protection

No changes were made to data scope, representative ownership rules, RLS business rules, Smart Cache, Offline Queue, reports, or calculations.
