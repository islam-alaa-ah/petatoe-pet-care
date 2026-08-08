# Phase M13.20 — Daily Customer Lookup State Reset Hotfix

## Root Cause
The Daily Operations phone lookup kept the previous result visible after the user edited or cleared the phone input. An in-flight lookup could also restore a stale result after the input had already changed.

## Fix
- Added one reset function for the lookup result container.
- Clear the previous result immediately on every phone-input edit, including full deletion.
- Invalidate in-flight lookup requests when the input changes.
- Prevent a delayed Supabase response or error from rendering unless the current input still matches the submitted phone number.

## Scope
Only the Daily Operations customer phone lookup UI state was changed. Search rules, permissions, customer ownership logic, Supabase queries, and other screens were not modified.

## Release
- Version: 18.15.1
- Cache: `kyum-crm-pwa-18-15-1-m13-20`
