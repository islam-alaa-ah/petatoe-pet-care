# Phase 5A — Supabase Enterprise Setup

## Important

This phase creates the secure database foundation. The web app is not switched from LocalStorage to live Supabase CRUD until Phase 5B because the complete Publishable Key has not been inserted yet.

## Run SQL files in this exact order

In the **Kyum Trading Company** Supabase project:

1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/policies.sql`
4. `supabase/phase2_customer_followups.sql`
5. `supabase/phase3_quotations.sql`
6. `supabase/phase4_reporting_views.sql`
7. `supabase/phase5a_enterprise_foundation.sql`
8. `supabase/phase5a_verify.sql`

Do not run these files in PETATOE.

## Configure the Publishable Key

Open:

`assets/js/supabase-config.js`

Replace:

`PASTE_COMPLETE_SB_PUBLISHABLE_KEY_HERE`

with the complete key that begins with:

`sb_publishable_`

Never use the Secret Key.

## First administrator

After running SQL:

1. Open **Authentication → Users**.
2. Add the first user.
3. Open SQL Editor and run:

```sql
update public.user_profiles
set
  full_name = 'System Administrator',
  role = 'super_admin',
  is_active = true
where id = (
  select id
  from auth.users
  where email = 'YOUR_EMAIL_ADDRESS'
);
```

Replace `YOUR_EMAIL_ADDRESS` with the exact email used in Authentication.

## Phase 5B

Phase 5B will:

- Replace the demo login with Supabase Auth.
- Load customers, follow-ups and quotations from Supabase.
- Remove LocalStorage as the production data source.
- Apply role-based UI visibility.
- Preserve the session after refresh.
- Add secure logout and loading/error handling.
