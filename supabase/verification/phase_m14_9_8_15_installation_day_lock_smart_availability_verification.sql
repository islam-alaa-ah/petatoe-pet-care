-- 1) Objects exist
select to_regclass('public.installation_schedule_day_locks') as day_lock_table,
       to_regprocedure('public.is_installation_schedule_day_locked(date)') as lock_check,
       to_regprocedure('public.get_installation_technician_booked_times(date,text,uuid)') as availability_rpc;
-- 2) Duplicate active technician slots. Expected: 0 rows
select scheduled_date,scheduled_time,lower(regexp_replace(trim(assigned_technician_name),'\s+',' ','g')) technician,count(*)
from public.installation_requests
where scheduled_date is not null and scheduled_time is not null and nullif(trim(assigned_technician_name),'') is not null and coalesce(status,'') not in ('ملغى','ملغاة')
group by 1,2,3 having count(*)>1;
-- 3) Locked days with latest audit data
select * from public.installation_schedule_day_locks order by schedule_date desc;
