# Phase M13.7.4 — Offline-First App Bootstrap

## Root Cause
The application required the Supabase CDN and online profile/permission requests before it could restore a previously saved user. This made the login screen appear offline even when the Supabase auth session and Smart Cache were already stored on the device. Data services also derived their cache namespace from `auth.getUser()`, which can require a network request.

## Implementation
- Added a local offline session/profile/permission/scope store.
- Offline bootstrap now runs without the Supabase JavaScript library.
- Online activation persists profile and role permissions for later offline startup.
- Explicit logout clears offline bootstrap credentials.
- Customers, followups, quotations and reference data use the locally restored user namespace before network auth.
- Representative data scopes are restored locally while offline.
- Script order now loads cache, permissions service and offline bootstrap dependencies before auth activation.

## Security
Offline startup is permitted only for a previously authenticated user on the same browser profile. No password is stored. First login, logout, cleared site data or missing cached permissions still require internet access.
