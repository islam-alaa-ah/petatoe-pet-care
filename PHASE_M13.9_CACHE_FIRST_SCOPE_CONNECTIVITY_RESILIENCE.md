# Phase M13.9 — Cache-First Scope & Connectivity Resilience

## Root Cause
Core read services still used browser connectivity state as a branching authority and applied a maximum stale age to cached data. On weak, captive, or falsely-online networks, scope resolution could fail before cached records were returned. Cached customer, follow-up, and quotation data could also become invisible after the stale window even though the IndexedDB entry remained valid.

## Implementation
- Smart Cache now supports an explicit `allowStaleAnyAge` recovery policy.
- Customers, Followups, and Quotations always accept the last integrity-valid cached dataset regardless of age.
- Representative scope resolution attempts the live scope when possible but safely falls back to the persisted scope on any network or Supabase failure.
- Cached data is returned immediately; network refresh is optional and runs only when a Supabase client exists.
- Each core service exposes freshness metadata.
- The UI shows that local data is being displayed and reports the age of the last cache write.
- No business calculations, SQL, schema, RLS, or permission rules were changed.

## Version
- Version: 18.7.0
- Build: 18700
- Service Worker cache: `kyum-crm-pwa-18-7-0-m13-9`
