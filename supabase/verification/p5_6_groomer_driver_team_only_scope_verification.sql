-- P5.6 verification
select
  u.id,
  u.full_name,
  u.role,
  u.representative_id,
  b.installation_team_id,
  t.name as team_name,
  dap.access_mode as installation_access_mode,
  case
    when u.representative_id is null
     and b.installation_team_id is not null
     and dap.access_mode='own'
    then 'PASS' else 'CHECK'
  end as status
from public.user_profiles u
left join public.installation_user_technician_bindings b on b.user_id=u.id
left join public.installation_teams t on t.id=b.installation_team_id
left join public.installation_data_access_profiles dap on dap.user_id=u.id
where u.role='viewer'::public.app_role
order by u.full_name;

select
  count(*)::bigint as viewer_representative_links_remaining
from public.user_data_access_representatives r
join public.user_profiles u on u.id=r.user_id
where u.role='viewer'::public.app_role;

select
  count(*)::bigint as viewer_installation_representative_links_remaining
from public.installation_data_access_representatives r
join public.user_profiles u on u.id=r.user_id
where u.role='viewer'::public.app_role;
