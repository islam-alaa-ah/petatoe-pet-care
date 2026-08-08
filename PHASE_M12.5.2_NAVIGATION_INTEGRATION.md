# Phase M12.5.2 — Navigation Integration

## Root Cause
Navigation visibility and route authorization were split between `CustomerPermissions`, desktop DOM state, and mobile mirroring. This allowed a child screen to be hidden while its parent group or another navigation surface remained visible.

## Changes
- Extended `PermissionEngine` with centralized navigation visibility, group visibility, current-view validation, and refresh events.
- Delegated legacy `applyScreenVisibility()` to the unified engine while preserving a fallback.
- Routed `switchView()` and `KYUMNavigation.canOpen()` through the unified engine.
- Made mobile bottom navigation consume direct engine decisions and refresh live after permission updates.
- Empty navigation groups collapse and disappear on desktop and mobile.

## Safety
No SQL, RLS, Supabase schema, permission values, data scope, or business logic was changed. The engine still reads the final decisions from the existing `CustomerPermissions.canScreen()` implementation.

## Version
- Version: 18.3.9
- Build: 18309
- Cache: kyum-crm-pwa-18-3-9-m12-5-2
