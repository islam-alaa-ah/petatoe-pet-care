select to_regclass('public.installation_revisits') as revisits_table;
select screen_key,screen_name,is_active from public.app_screens where screen_key in ('installationExceptions','installationReports') order by screen_key;
select indexname from pg_indexes where tablename='installation_revisits' order by indexname;
select policyname,cmd from pg_policies where schemaname='public' and tablename='installation_revisits' order by policyname;
