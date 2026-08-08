# Phase M13.7.5 — Offline Cache Loader Guard Fix

## Root Cause
The UI loader functions returned before invoking the domain services whenever `window.customerSupabase` was unavailable. This blocked IndexedDB Smart Cache reads during a valid offline session and left the UI in a permanent loading state with zero dashboard metrics.

Affected guards:
- `loadReferenceDataFromSupabase()`
- `loadCustomersFromSupabase()`
- `loadFollowupsFromSupabase()`
- `loadQuotationsFromSupabase()`

## Fix
The UI now requires only the corresponding domain service. The service itself decides whether to read Smart Cache or use Supabase. Offline startup can therefore read cached customers, followups, quotations, and reference data without a Supabase JavaScript client.

Loading messages now distinguish cached offline loading from online synchronization.

## Scope
No SQL, schema, RLS, business calculations, desktop styling, or unrelated modules were changed.

## Version
- Version: 18.5.5
- Build: 18505
- Service Worker Cache: `kyum-crm-pwa-18-5-5-m13-7-5`
