# Phase M13.7.3 — Offline Cached Data Bootstrap Fix

## Root Cause
- Smart Cache namespace used `auth.getUser()`, which performs a server validation. Offline it fell back to `user:anonymous`, while data had been stored under `user:<id>`.
- Sales representative scope was queried from Supabase before the cache key was calculated, so offline execution failed before IndexedDB could be read.
- Profile and role permissions had no durable offline fallback in this baseline.

## Fix
- Namespace now uses the active local auth/session/profile identity first.
- User profile, permissions, and representative data scope are persisted and restored locally.
- Customer, follow-up, and quotation services read their correct user-scoped IndexedDB entries while offline.
- New password authentication remains online-only.

## Security
- No cross-user fallback to anonymous data.
- No permission bypass.
- Offline access requires a previously successful authenticated online session on the same device.
