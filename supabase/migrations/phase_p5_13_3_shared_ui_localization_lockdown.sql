-- P5.13.3 — Localization Core & Shared UI Lockdown
-- Seeds only shared header/notification-shell strings.
-- Existing sidebar and customized translations are intentionally preserved.

insert into public.app_translations
  (translation_key, screen_key, module_name, text_type, ar_text, en_text, default_ar, default_en, is_active)
values
  ('shared.header.menu','shared','core','label','فتح القائمة','Open menu','فتح القائمة','Open menu',true),
  ('shared.header.notifications','shared','core','label','الإشعارات','Notifications','الإشعارات','Notifications',true),
  ('shared.header.markAllRead','shared','core','button','تحديد الكل كمقروء','Mark all as read','تحديد الكل كمقروء','Mark all as read',true),
  ('shared.header.systemUser','shared','core','label','مستخدم النظام','System user','مستخدم النظام','System user',true),
  ('shared.header.scrollAria','shared','core','label','ضغطة واحدة للأعلى، ضغطتان لأسفل','One click to top, double-click to bottom','ضغطة واحدة للأعلى، ضغطتان لأسفل','One click to top, double-click to bottom',true),
  ('shared.header.scrollTitle','shared','core','label','ضغطة واحدة: أعلى الصفحة — ضغطتان: أسفل الصفحة','One click: top of page — double-click: bottom of page','ضغطة واحدة: أعلى الصفحة — ضغطتان: أسفل الصفحة','One click: top of page — double-click: bottom of page',true),
  ('shared.header.themeEnableDark','shared','core','label','تفعيل الوضع الداكن','Enable dark mode','تفعيل الوضع الداكن','Enable dark mode',true),
  ('shared.header.themeEnableLight','shared','core','label','تفعيل الوضع الفاتح','Enable light mode','تفعيل الوضع الفاتح','Enable light mode',true),
  ('shared.header.themeSwitchDark','shared','core','label','التبديل إلى الوضع الداكن','Switch to dark mode','التبديل إلى الوضع الداكن','Switch to dark mode',true),
  ('shared.header.themeSwitchLight','shared','core','label','التبديل إلى الوضع الفاتح','Switch to light mode','التبديل إلى الوضع الفاتح','Switch to light mode',true),
  ('shared.notifications.empty','shared','core','empty','لا توجد إشعارات.','No notifications','لا توجد إشعارات.','No notifications',true),
  ('shared.notifications.now','shared','core','format','الآن','Now','الآن','Now',true),
  ('shared.notifications.minutesAgo','shared','core','format','منذ {count} دقيقة','{count} min ago','منذ {count} دقيقة','{count} min ago',true),
  ('shared.notifications.hoursAgo','shared','core','format','منذ {count} ساعة','{count} hr ago','منذ {count} ساعة','{count} hr ago',true)
on conflict (translation_key) do nothing;

-- Verification: should return 14 / 14.
select count(*) filter (where screen_key='shared' and is_active) as shared_active,
       count(*) filter (where screen_key='shared' and is_active and length(trim(ar_text))>0 and length(trim(en_text))>0) as shared_complete
from public.app_translations
where translation_key like 'shared.%';
