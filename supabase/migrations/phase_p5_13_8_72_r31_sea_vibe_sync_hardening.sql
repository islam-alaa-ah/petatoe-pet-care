-- P5.13.8.72 R31 — SEA VIBE Sync Hardening (S6)
-- Scope:
--   1) Retry-safe idempotency for SEA VIBE offline-capable mutations.
--   2) Atomic optimistic-concurrency guards for queued updates/status changes.
--   3) Retry-safe expense attachment evidence keys.
-- No business formulas, RLS policies, delete policy, payroll, appointments, or shared sync-engine changes.
begin;

create table if not exists public.sea_vibe_sync_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  operation_key text not null,
  entity_kind text not null,
  mutation_kind text not null,
  entity_id uuid null,
  result jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, operation_key)
);

create index if not exists idx_sea_vibe_sync_operations_applied
  on public.sea_vibe_sync_operations(applied_at desc);
create index if not exists idx_sea_vibe_sync_operations_entity
  on public.sea_vibe_sync_operations(entity_kind, entity_id, applied_at desc);

alter table public.sea_vibe_sync_operations enable row level security;
revoke all on table public.sea_vibe_sync_operations from anon, authenticated;

alter table public.sea_vibe_expense_attachments
  add column if not exists client_operation_key text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='uq_sea_vibe_expense_attachments_client_operation_key'
      and conrelid='public.sea_vibe_expense_attachments'::regclass
  ) then
    alter table public.sea_vibe_expense_attachments
      add constraint uq_sea_vibe_expense_attachments_client_operation_key unique(client_operation_key);
  end if;
end $$;

alter table public.sea_vibe_zawel_transactions
  add column if not exists updated_at timestamptz;
update public.sea_vibe_zawel_transactions
set updated_at=coalesce(updated_at,created_at,now())
where updated_at is null;
alter table public.sea_vibe_zawel_transactions
  alter column updated_at set default now();
alter table public.sea_vibe_zawel_transactions
  alter column updated_at set not null;

create or replace function public.sea_vibe_touch_zawel_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at:=now();
  return new;
end;
$$;
drop trigger if exists trg_sea_vibe_zawel_touch on public.sea_vibe_zawel_transactions;
create trigger trg_sea_vibe_zawel_touch
before update on public.sea_vibe_zawel_transactions
for each row execute function public.sea_vibe_touch_zawel_updated_at();

create or replace function public.sync_sea_vibe_mutation(
  p_kind text,
  p_mutation text,
  p_operation_key text,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_base_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  kind_name text:=lower(trim(coalesce(p_kind,'')));
  mutation_name text:=lower(trim(coalesce(p_mutation,'')));
  op public.sea_vibe_sync_operations%rowtype;
  trip public.sea_vibe_trips%rowtype;
  asset public.sea_vibe_assets%rowtype;
  v_id uuid;
  v_updated_at timestamptz;
  v_name_ar text;
  v_name_en text;
  v_is_active boolean;
  v_table text;
  v_ref_kind text;
  v_status text;
  v_result jsonb;
  v_batch jsonb;
  v_entry jsonb;
  v_people integer;
  v_hours integer;
  v_points integer;
  v_amount numeric(14,2);
  v_server_points integer;
  v_server_amount numeric(14,2);
  v_server_updated_at timestamptz;
  v_base timestamptz;
  v_topup_id uuid;
  v_same boolean:=false;
begin
  if actor is null then raise exception 'SEA_VIBE_SYNC_AUTH_REQUIRED'; end if;
  if nullif(trim(coalesce(p_operation_key,'')),'') is null then raise exception 'SEA_VIBE_SYNC_OPERATION_KEY_REQUIRED'; end if;
  if length(p_operation_key)>300 then raise exception 'SEA_VIBE_SYNC_OPERATION_KEY_INVALID'; end if;

  select * into op
  from public.sea_vibe_sync_operations
  where user_id=actor and operation_key=p_operation_key;
  if found then
    if op.entity_kind is distinct from kind_name
       or op.mutation_kind is distinct from mutation_name
       or (p_entity_id is not null and op.entity_id is not null and op.entity_id is distinct from p_entity_id) then
      raise exception 'SEA_VIBE_SYNC_OPERATION_KEY_REUSED';
    end if;
    return coalesce(op.result,'{}'::jsonb)||jsonb_build_object('ok',true,'idempotent',true);
  end if;

  if kind_name='trip' then
    if mutation_name='create' then
      if not (public.has_screen_permission('seaVibeTripNew','add') or public.has_screen_permission('seaVibeTrips','add')) then
        raise exception 'permission_denied';
      end if;
      insert into public.sea_vibe_trips(
        trip_date,start_time,duration_hours,people_count,trip_type_id,total_value,notes,created_by,updated_by
      ) values(
        nullif(p_payload->>'date','')::date,
        nullif(p_payload->>'startTime','')::time,
        coalesce((p_payload->>'durationHours')::integer,0),
        coalesce((p_payload->>'peopleCount')::integer,0),
        nullif(p_payload->>'tripTypeId','')::uuid,
        coalesce((p_payload->>'totalValue')::numeric,0),
        nullif(btrim(coalesce(p_payload->>'notes','')),''),
        actor,actor
      ) returning id,updated_at into v_id,v_updated_at;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',true);

    elsif mutation_name='update' then
      if not public.has_screen_permission('seaVibeTrips','edit') then raise exception 'permission_denied'; end if;
      select * into trip from public.sea_vibe_trips where id=p_entity_id for update;
      if not found then raise exception 'SEA_VIBE_TRIP_NOT_FOUND'; end if;
      v_same:=trip.trip_date = nullif(p_payload->>'date','')::date
        and trip.start_time = nullif(p_payload->>'startTime','')::time
        and trip.duration_hours = coalesce((p_payload->>'durationHours')::integer,0)
        and trip.people_count = coalesce((p_payload->>'peopleCount')::integer,0)
        and trip.trip_type_id = nullif(p_payload->>'tripTypeId','')::uuid
        and trip.total_value = coalesce((p_payload->>'totalValue')::numeric,0)
        and coalesce(trip.notes,'') = coalesce(nullif(btrim(coalesce(p_payload->>'notes','')),''),'');
      if not v_same and (p_base_updated_at is null or trip.updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل الرحلة على الخادم بعد آخر مزامنة.','id',trip.id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',trip.updated_at);
      end if;
      if not v_same then
        update public.sea_vibe_trips set
          trip_date=nullif(p_payload->>'date','')::date,
          start_time=nullif(p_payload->>'startTime','')::time,
          duration_hours=coalesce((p_payload->>'durationHours')::integer,0),
          people_count=coalesce((p_payload->>'peopleCount')::integer,0),
          trip_type_id=nullif(p_payload->>'tripTypeId','')::uuid,
          total_value=coalesce((p_payload->>'totalValue')::numeric,0),
          notes=nullif(btrim(coalesce(p_payload->>'notes','')),''),
          updated_by=actor
        where id=trip.id
        returning updated_at into v_updated_at;
      else
        v_updated_at:=trip.updated_at;
      end if;
      v_id:=trip.id;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',not v_same,'converged',v_same);

    elsif mutation_name='status' then
      if not public.has_screen_permission('seaVibeTrips','edit') then raise exception 'permission_denied'; end if;
      v_status:=lower(trim(coalesce(p_payload->>'status','')));
      if v_status not in ('open','closed') then raise exception 'SEA_VIBE_TRIP_STATUS_INVALID'; end if;
      select * into trip from public.sea_vibe_trips where id=p_entity_id for update;
      if not found then raise exception 'SEA_VIBE_TRIP_NOT_FOUND'; end if;
      if trip.status<>v_status and (p_base_updated_at is null or trip.updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تغيير حالة الرحلة على الخادم بعد آخر مزامنة.','id',trip.id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',trip.updated_at,'serverStatus',trip.status);
      end if;
      if trip.status<>v_status then
        if v_status='closed' then
          update public.sea_vibe_trips set status='closed',closed_at=now(),closed_by=actor,updated_by=actor where id=trip.id returning updated_at into v_updated_at;
        else
          update public.sea_vibe_trips set status='open',reopened_at=now(),reopened_by=actor,updated_by=actor where id=trip.id returning updated_at into v_updated_at;
        end if;
      else
        v_updated_at:=trip.updated_at;
      end if;
      v_id:=trip.id;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',trip.status<>v_status,'converged',trip.status=v_status,'status',v_status);
    else
      raise exception 'SEA_VIBE_TRIP_MUTATION_UNSUPPORTED';
    end if;

  elsif kind_name='asset' then
    if mutation_name='create' then
      if not public.has_screen_permission('seaVibeAssets','add') then raise exception 'permission_denied'; end if;
      insert into public.sea_vibe_assets(asset_name,initial_value,notes,is_active,created_by,updated_by)
      values(
        btrim(coalesce(p_payload->>'name','')),
        coalesce((p_payload->>'initialValue')::numeric,0),
        nullif(btrim(coalesce(p_payload->>'notes','')),''),
        coalesce((p_payload->>'isActive')::boolean,true),actor,actor
      ) returning id,updated_at into v_id,v_updated_at;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',true);
    elsif mutation_name='update' then
      if not public.has_screen_permission('seaVibeAssets','edit') then raise exception 'permission_denied'; end if;
      select * into asset from public.sea_vibe_assets where id=p_entity_id for update;
      if not found then raise exception 'SEA_VIBE_ASSET_NOT_FOUND'; end if;
      v_same:=asset.asset_name=btrim(coalesce(p_payload->>'name',''))
        and asset.initial_value=coalesce((p_payload->>'initialValue')::numeric,0)
        and coalesce(asset.notes,'')=coalesce(nullif(btrim(coalesce(p_payload->>'notes','')),''),'')
        and asset.is_active=coalesce((p_payload->>'isActive')::boolean,true);
      if not v_same and (p_base_updated_at is null or asset.updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل الأصل على الخادم بعد آخر مزامنة.','id',asset.id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',asset.updated_at);
      end if;
      if not v_same then
        update public.sea_vibe_assets set
          asset_name=btrim(coalesce(p_payload->>'name','')),
          initial_value=coalesce((p_payload->>'initialValue')::numeric,0),
          notes=nullif(btrim(coalesce(p_payload->>'notes','')),''),
          is_active=coalesce((p_payload->>'isActive')::boolean,true),
          updated_by=actor
        where id=asset.id returning updated_at into v_updated_at;
      else
        v_updated_at:=asset.updated_at;
      end if;
      v_id:=asset.id;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',not v_same,'converged',v_same);
    else
      raise exception 'SEA_VIBE_ASSET_MUTATION_UNSUPPORTED';
    end if;

  elsif kind_name='reference' then
    v_ref_kind:=coalesce(p_payload->>'refKind','');
    if v_ref_kind='tripTypes' then v_table:='sea_vibe_trip_types';
    elsif v_ref_kind='paymentMethods' then v_table:='sea_vibe_payment_methods';
    elsif v_ref_kind='expenseCatalog' then v_table:='sea_vibe_expense_catalog';
    else raise exception 'SEA_VIBE_REFERENCE_KIND_INVALID'; end if;

    if mutation_name='create' then
      if not public.has_screen_permission('seaVibeReference','add') then raise exception 'permission_denied'; end if;
      execute format('insert into public.%I(name_ar,name_en,is_active) values($1,$2,$3) returning id,updated_at',v_table)
      into v_id,v_updated_at
      using btrim(coalesce(p_payload->>'nameAr','')),btrim(coalesce(p_payload->>'nameEn','')),coalesce((p_payload->>'isActive')::boolean,true);
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',true);
    elsif mutation_name='update' then
      if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;
      execute format('select name_ar,name_en,is_active,updated_at from public.%I where id=$1 for update',v_table)
      into v_name_ar,v_name_en,v_is_active,v_server_updated_at using p_entity_id;
      if v_server_updated_at is null then raise exception 'SEA_VIBE_REFERENCE_NOT_FOUND'; end if;
      v_same:=v_name_ar=btrim(coalesce(p_payload->>'nameAr',''))
        and v_name_en=btrim(coalesce(p_payload->>'nameEn',''))
        and v_is_active=coalesce((p_payload->>'isActive')::boolean,true);
      if not v_same and (p_base_updated_at is null or v_server_updated_at<>p_base_updated_at) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل البيانات المرجعية على الخادم بعد آخر مزامنة.','id',p_entity_id,'baseUpdatedAt',p_base_updated_at,'serverUpdatedAt',v_server_updated_at);
      end if;
      if not v_same then
        execute format('update public.%I set name_ar=$1,name_en=$2,is_active=$3,updated_at=now() where id=$4 returning updated_at',v_table)
        into v_updated_at
        using btrim(coalesce(p_payload->>'nameAr','')),btrim(coalesce(p_payload->>'nameEn','')),coalesce((p_payload->>'isActive')::boolean,true),p_entity_id;
      else
        v_updated_at:=v_server_updated_at;
      end if;
      v_id:=p_entity_id;
      v_result:=jsonb_build_object('ok',true,'id',v_id,'updatedAt',v_updated_at,'applied',not v_same,'converged',v_same);
    else
      raise exception 'SEA_VIBE_REFERENCE_MUTATION_UNSUPPORTED';
    end if;

  elsif kind_name='expense_batch' then
    if mutation_name<>'create' then raise exception 'SEA_VIBE_EXPENSE_MUTATION_UNSUPPORTED'; end if;
    v_batch:=public.sea_vibe_add_expense_batch(
      p_payload->>'scope',
      nullif(p_payload->>'tripId','')::uuid,
      nullif(p_payload->>'assetId','')::uuid,
      coalesce(p_payload->'lines','[]'::jsonb)
    );
    v_id:=nullif(v_batch->>'movement_group_id','')::uuid;
    v_result:=coalesce(v_batch,'{}'::jsonb)||jsonb_build_object('ok',true,'id',v_id,'applied',true);

  elsif kind_name='permit_fees' then
    if mutation_name<>'update' then raise exception 'SEA_VIBE_PERMIT_MUTATION_UNSUPPORTED'; end if;
    if not public.has_screen_permission('seaVibeReference','edit') then raise exception 'permission_denied'; end if;
    if jsonb_typeof(p_payload->'entries')<>'array' then raise exception 'SEA_VIBE_PERMIT_ENTRIES_REQUIRED'; end if;

    -- Validate all rows before applying any row so the batch is atomic on conflict.
    for v_entry in select value from jsonb_array_elements(p_payload->'entries') loop
      v_people:=coalesce((v_entry->>'peopleCount')::integer,0);
      v_hours:=coalesce((v_entry->>'durationHours')::integer,0);
      v_points:=coalesce((v_entry->>'points')::integer,0);
      v_amount:=coalesce((v_entry->>'amount')::numeric,0);
      v_base:=nullif(v_entry->>'baseUpdatedAt','')::timestamptz;
      select points,fee_amount,updated_at into v_server_points,v_server_amount,v_server_updated_at
      from public.sea_vibe_sailing_permit_fees
      where people_count=v_people and duration_hours=v_hours
      for update;
      if v_server_updated_at is not null
         and not (coalesce(v_server_points,0)=v_points and v_server_amount=v_amount)
         and (v_base is null or v_server_updated_at<>v_base) then
        return jsonb_build_object('ok',false,'conflict',true,'message','تم تعديل مصفوفة تصريح الإبحار على الخادم بعد آخر مزامنة.','peopleCount',v_people,'durationHours',v_hours,'baseUpdatedAt',v_base,'serverUpdatedAt',v_server_updated_at);
      end if;
    end loop;

    for v_entry in select value from jsonb_array_elements(p_payload->'entries') loop
      v_people:=coalesce((v_entry->>'peopleCount')::integer,0);
      v_hours:=coalesce((v_entry->>'durationHours')::integer,0);
      v_points:=coalesce((v_entry->>'points')::integer,0);
      v_amount:=coalesce((v_entry->>'amount')::numeric,0);
      insert into public.sea_vibe_sailing_permit_fees(people_count,duration_hours,fee_amount,points,updated_at)
      values(v_people,v_hours,v_amount,v_points,now())
      on conflict(people_count,duration_hours) do update set fee_amount=excluded.fee_amount,points=excluded.points,updated_at=now();
    end loop;
    v_result:=jsonb_build_object('ok',true,'id','permit-fees','applied',true);

  elsif kind_name='zawel_topup' then
    if mutation_name<>'create' then raise exception 'SEA_VIBE_ZAWEL_MUTATION_UNSUPPORTED'; end if;
    v_topup_id:=public.sea_vibe_zawel_topup(
      coalesce((p_payload->>'points')::integer,0),
      nullif(btrim(coalesce(p_payload->>'notes','')),''),
      coalesce(nullif(p_payload->>'transactionDate','')::date,current_date)
    );
    v_id:=v_topup_id;
    v_result:=jsonb_build_object('ok',true,'id',v_id,'applied',true);

  else
    raise exception 'SEA_VIBE_SYNC_KIND_UNSUPPORTED';
  end if;

  insert into public.sea_vibe_sync_operations(user_id,operation_key,entity_kind,mutation_kind,entity_id,result)
  values(actor,p_operation_key,kind_name,mutation_name,v_id,coalesce(v_result,'{}'::jsonb))
  on conflict(user_id,operation_key) do nothing;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

grant execute on function public.sync_sea_vibe_mutation(text,text,text,uuid,jsonb,timestamptz) to authenticated;

commit;
