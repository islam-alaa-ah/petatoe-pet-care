-- Phase M14.9.8.3 verification

-- 1. Must return 0 rows: request owner differs from customer owner.
select
  r.id,
  r.request_number,
  r.representative_id as request_representative_id,
  c.representative_id as customer_representative_id
from public.installation_requests r
join public.customers c on c.id=r.customer_id
where c.representative_id is not null
  and r.representative_id is distinct from c.representative_id;

-- 2. Users whose own installation scope cannot resolve because no representative is linked.
select
  up.id,
  up.full_name,
  up.email,
  up.role,
  iap.access_mode
from public.user_profiles up
join public.installation_data_access_profiles iap on iap.user_id=up.id
where up.is_active=true
  and iap.access_mode='own'
  and up.representative_id is null;

-- 3. Role permissions controlling the quotation add button.
select role,screen_key,can_view,can_add
from public.role_screen_permissions
where screen_key='quotations'
order by role;

-- 4. Active users and their effective quotation permission source.
select
  up.id,
  up.full_name,
  up.email,
  up.role,
  up.representative_id,
  coalesce(rsp.can_view,false) as can_view_quotations,
  coalesce(rsp.can_add,false) as can_add_quotation
from public.user_profiles up
left join public.role_screen_permissions rsp
  on rsp.role=up.role and rsp.screen_key='quotations'
where up.is_active=true
order by up.role,up.full_name;

-- 5. Must return 0 rows for active non-super-admin users whose role has add without view.
select up.id,up.full_name,up.email,up.role
from public.user_profiles up
join public.role_screen_permissions rsp
  on rsp.role=up.role and rsp.screen_key='quotations'
where up.is_active=true
  and up.role<>'super_admin'
  and rsp.can_add=true
  and rsp.can_view=false;
