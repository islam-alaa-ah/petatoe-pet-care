-- Phase M15.13.10 verification (read-only)
select
  p.proname,
  pg_get_functiondef(p.oid) ilike '%status not in (''بانتظار الجدولة'',''مجدولة'')%' as preserves_history,
  pg_get_functiondef(p.oid) ilike '%status=''مؤكدة''%' as uses_confirmed_execution,
  pg_get_functiondef(p.oid) ilike '%توزيع الكمية المتبقية للخدمة غير مكتمل%' as validates_remaining_quantity,
  pg_get_functiondef(p.oid) not ilike '%لا يمكن إعادة توزيع طلب بدأ تنفيذه%' as old_execution_block_removed
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='schedule_installation_request_multi_day';

-- No confirmed visit should ever be deleted by the scheduling function.
select count(*) as confirmed_visits
from public.installation_execution_visits
where status='مؤكدة';
