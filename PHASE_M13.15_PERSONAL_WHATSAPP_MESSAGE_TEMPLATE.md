# Phase M13.15 — Personal WhatsApp Message Template

- One message and one optional image per authenticated user.
- Private table protected by RLS.
- Private Storage bucket scoped to the user-id folder.
- Direct WhatsApp action opens the customer number with prepared text.
- Image + message action uses Web Share API where supported, with text-only direct fallback.

## Required deployment step
Run `supabase/migrations/phase_m13_15_personal_whatsapp_template.sql` in Supabase before testing uploads.
