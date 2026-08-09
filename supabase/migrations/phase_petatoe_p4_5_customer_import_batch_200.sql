-- PETATOE P4.5 — Customer Import 200-row Batch RPC
begin;

create or replace function public.import_customers_batch(
  p_rows jsonb,
  p_mode text default 'new_only'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_id uuid;
  v_existing_id uuid;
  v_code text;
  v_name text;
  v_address text;
  v_mobile text;
  v_source_row integer;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  if not public.has_screen_permission('customers','add') then
    raise exception 'Customer add permission required' using errcode='42501';
  end if;
  if coalesce(p_mode,'new_only') not in ('new_only','upsert') then
    raise exception 'Unsupported import mode' using errcode='22023';
  end if;
  if p_mode='upsert' and not public.has_screen_permission('customers','edit') then
    raise exception 'Customer edit permission required' using errcode='42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode='22023';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'Maximum batch size is 200 rows' using errcode='22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_source_row := nullif(v_item->>'sourceRow','')::integer;
      v_code := btrim(coalesce(v_item->>'code',v_item->>'customerNumber',''));
      v_name := btrim(coalesce(v_item->>'name',''));
      v_address := nullif(btrim(coalesce(v_item->>'address','')),'');
      v_mobile := btrim(coalesce(v_item->>'mobile',v_item->>'phone',''));
      v_existing_id := nullif(v_item->>'existingCustomerId','')::uuid;

      if v_code='' then raise exception 'code مطلوب'; end if;
      if v_name='' then raise exception 'name مطلوب'; end if;
      if v_mobile !~ '^05[0-9]{8}$' then raise exception 'mobile غير صالح'; end if;

      if v_existing_id is null then
        select c.id into v_existing_id
        from public.customers c
        where c.customer_number=v_code
           or c.normalized_phone=v_mobile
        order by c.created_at,c.id
        limit 1;
      end if;

      if v_existing_id is not null and p_mode='new_only' then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if v_existing_id is not null then
        update public.customers
        set customer_number=v_code,
            customer_name=v_name,
            address=v_address,
            phone=v_mobile,
            updated_at=now()
        where id=v_existing_id
        returning id into v_id;

        if not found then raise exception 'العميل الموجود لم يعد متاحاً'; end if;
        v_updated := v_updated + 1;
      else
        insert into public.customers(
          customer_number,customer_name,address,phone,created_by
        )
        values(v_code,v_name,v_address,v_mobile,v_user)
        returning id into v_id;
        v_inserted := v_inserted + 1;
      end if;

    exception
      when unique_violation then
        v_skipped := v_skipped + 1;
      when others then
        v_failed := v_failed + 1;
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object(
            'sourceRow',v_source_row,
            'customerNumber',v_code,
            'name',v_name,
            'address',coalesce(v_address,''),
            'phone',v_mobile,
            'message',sqlerrm
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'inserted',v_inserted,
    'updated',v_updated,
    'skipped',v_skipped,
    'failed',v_failed,
    'errors',v_errors
  );
end;
$$;

revoke all on function public.import_customers_batch(jsonb,text) from public,anon;
grant execute on function public.import_customers_batch(jsonb,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='import_customers_batch';
