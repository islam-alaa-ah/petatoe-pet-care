-- PETATOE P4.3 — Customer Import Override Re-authentication
-- Removes the runtime dependency on the missing verify-admin-import-override Edge Function.
-- Password verification is done by Supabase Auth in the client against the CURRENT signed-in user.
-- These SECURITY DEFINER RPCs only write/finalize the audit after verifying the current role is super_admin.

begin;

create or replace function public.begin_admin_import_override(
  p_file_name text,
  p_total_rows integer,
  p_override_rows integer,
  p_duplicate_rows integer
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'Super admin access required' using errcode='42501';
  end if;

  insert into public.admin_import_overrides(
    user_id,
    file_name,
    total_rows,
    override_rows,
    duplicate_rows,
    metadata
  )
  values(
    v_user,
    nullif(btrim(coalesce(p_file_name,'')),''),
    greatest(coalesce(p_total_rows,0),0),
    greatest(coalesce(p_override_rows,0),0),
    greatest(coalesce(p_duplicate_rows,0),0),
    jsonb_build_object(
      'status','verified',
      'verified_at',now(),
      'verification_method','supabase_auth_reauthentication'
    )
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.finalize_admin_import_override(
  p_audit_id uuid,
  p_status text,
  p_inserted_rows integer,
  p_updated_rows integer,
  p_skipped_rows integer,
  p_failed_rows integer,
  p_override_rows integer
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  if public.current_user_role() <> 'super_admin'::public.app_role then
    raise exception 'Super admin access required' using errcode='42501';
  end if;

  update public.admin_import_overrides
  set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
    'status',coalesce(nullif(btrim(p_status),''),'completed'),
    'finalized_at',now(),
    'inserted_rows',greatest(coalesce(p_inserted_rows,0),0),
    'updated_rows',greatest(coalesce(p_updated_rows,0),0),
    'skipped_rows',greatest(coalesce(p_skipped_rows,0),0),
    'failed_rows',greatest(coalesce(p_failed_rows,0),0),
    'override_rows_final',greatest(coalesce(p_override_rows,0),0)
  )
  where id=p_audit_id
    and user_id=v_user;

  if not found then
    raise exception 'Override audit record was not found for current user' using errcode='P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.begin_admin_import_override(text,integer,integer,integer) from public,anon;
revoke all on function public.finalize_admin_import_override(uuid,text,integer,integer,integer,integer,integer) from public,anon;

grant execute on function public.begin_admin_import_override(text,integer,integer,integer) to authenticated,service_role;
grant execute on function public.finalize_admin_import_override(uuid,text,integer,integer,integer,integer,integer) to authenticated,service_role;

notify pgrst,'reload schema';

commit;

-- Verification
select p.proname as function_name,
       p.prosecdef as security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in('begin_admin_import_override','finalize_admin_import_override')
order by p.proname;

