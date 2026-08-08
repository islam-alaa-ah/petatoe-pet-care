-- Phase M14.9.8.15.3 verification
select proname from pg_proc where proname='schedule_installation_request_multi_day';
select count(*) as invalid_visit_quantities from public.installation_execution_visit_services where scheduled_quantity<0;
select installation_request_id,request_service_id,sum(scheduled_quantity) scheduled
from public.installation_execution_visit_services s join public.installation_execution_visits v on v.id=s.visit_id
where v.status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
group by installation_request_id,request_service_id
having sum(scheduled_quantity)>(select quantity from public.installation_request_services rs where rs.id=s.request_service_id);
select scheduled_date,scheduled_time,lower(trim(technician_name)) technician,count(*)
from public.installation_execution_visits where status in ('مجدولة','قيد التنفيذ','بانتظار التأكيد')
group by scheduled_date,scheduled_time,lower(trim(technician_name)) having count(*)>1;
