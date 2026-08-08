# Phase 5B.1 — Supabase Auth Setup

1. افتح `assets/js/supabase-config.js`.
2. استبدل `PASTE_COMPLETE_SB_PUBLISHABLE_KEY_HERE` بالمفتاح الكامل الذي يبدأ بـ `sb_publishable_`.
3. أنشئ أول مستخدم من `Authentication → Users`.
4. حوّله إلى `super_admin`:

```sql
update public.user_profiles
set full_name = 'Ahmed Alaa', role = 'super_admin', is_active = true
where id = (select id from auth.users where email = 'YOUR_EMAIL_ADDRESS');
```

5. من `Authentication → URL Configuration` ضع رابط GitHub Pages في Site URL وRedirect URLs.
6. ارفع الملفات واختبر تسجيل الدخول ثم Refresh ثم تسجيل الخروج.

هذه المرحلة تفعل تسجيل الدخول فقط. بيانات العملاء والمتابعات والعروض ما زالت محلية مؤقتًا.
