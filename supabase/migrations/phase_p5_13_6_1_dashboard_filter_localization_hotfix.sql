-- PETATOE P5.13.6.1 — Dashboard Filter Localization Hotfix
insert into public.app_translations
(translation_key,screen_key,module_name,text_type,ar_text,en_text,default_ar,default_en,is_active)
values
('dashboard.filter.fromDisplay','dashboard','dashboard','label','من تاريخ','From date','من تاريخ','From date',true),
('dashboard.filter.toDisplay','dashboard','dashboard','label','إلى تاريخ','To date','إلى تاريخ','To date',true)
on conflict (translation_key) do update set
screen_key=excluded.screen_key,module_name=excluded.module_name,text_type=excluded.text_type,
default_ar=excluded.default_ar,default_en=excluded.default_en,
ar_text=case when coalesce(public.app_translations.ar_text,'')='' then excluded.ar_text else public.app_translations.ar_text end,
en_text=case when coalesce(public.app_translations.en_text,'')='' then excluded.en_text else public.app_translations.en_text end,
is_active=true;
