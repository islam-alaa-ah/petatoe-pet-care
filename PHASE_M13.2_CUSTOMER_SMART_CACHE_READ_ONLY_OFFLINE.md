# Phase M13.2 — Customer Smart Cache & Read-Only Offline

## Baseline
Latest uploaded enterprise baseline with Phase M13.1 merged.

## Root Cause
Customer data was fetched completely from Supabase on every fresh application start. On slow Android networks, the customer-dependent screens remained blocked until all paginated requests completed.

## Implementation
- Added a read-only IndexedDB cache path to `CustomersService.listCustomers()`.
- Cache namespace is isolated by authenticated user.
- Cache keys include the resolved representative data scope, preventing reuse after scope changes.
- Cached rows render immediately; a Supabase refresh runs in the background.
- The UI is updated only when the network result hash differs from the cached result.
- Successful customer save/delete invalidates customer cache entries.
- `force=true` bypasses cache and performs a network refresh.

## Safety
No offline create, update, delete, import, or conflict resolution was added. SQL, RLS, Supabase schema, permissions, and business rules were not changed.

## Version
18.4.1 / build 18401 / cache `kyum-crm-pwa-18-4-1-m13-2`.
