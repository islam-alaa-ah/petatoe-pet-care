# Supabase URL Hotfix

## Root Cause

The configured project URL contained an extra `s`:

Incorrect:
`https://cmygycvnsglyqipgpssin.supabase.co`

Correct:
`https://cmygycvnsglyqipgpsin.supabase.co`

This caused the browser error:

`net::ERR_NAME_NOT_RESOLVED`

## Action

Upload this package directly to GitHub. No manual code edits are required.
