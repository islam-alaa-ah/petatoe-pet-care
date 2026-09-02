-- P5.13.8.72 R40 — Financial retry horizon policy
-- S15: Bound online financial retry to 90 days without enabling ledger pruning.
-- Existing result-ledger hits remain idempotent indefinitely; if the heavy result row is
-- pruned in a later phase, the compact replay guard rejects stale re-execution.

begin;

create table if not exists public.installation_financial_replay_policy (
  policy_key text primary key,
  policy_version text not null,
  replay_horizon_days integer not null check (replay_horizon_days between 1 and 3650),
  safety_buffer_days integer not null check (safety_buffer_days between 0 and 3650),
  compact_guard_retention_mode text not null default 'indefinite' check (compact_guard_retention_mode in ('indefinite')),
  ledger_pruning_enabled boolean not null default false,
  activated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.installation_financial_replay_policy(
  policy_key,policy_version,replay_horizon_days,safety_buffer_days,compact_guard_retention_mode,ledger_pruning_enabled,activated_at,updated_at
) values (
  'appointment_financial','r40-financial-90d-v1',90,30,'indefinite',false,now(),now()
)
on conflict (policy_key) do update set
  policy_version=excluded.policy_version,
  replay_horizon_days=excluded.replay_horizon_days,
  safety_buffer_days=excluded.safety_buffer_days,
  compact_guard_retention_mode=excluded.compact_guard_retention_mode,
  ledger_pruning_enabled=false,
  updated_at=now();

create table if not exists public.installation_financial_replay_guards (
  user_id uuid not null,
  operation_key text not null,
  operation_type text not null,
  payload_hash text not null,
  first_server_attempt_at timestamptz not null,
  replay_expires_at timestamptz not null,
  policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,operation_key),
  constraint installation_financial_replay_guards_type_chk check (operation_type in (
    'collection','collection_recovery','quantity_confirmation','quantity_invoice','quantity_confirmation_cancel','visit_invoice','legacy_completion_invoice'
  ))
);
create index if not exists idx_installation_financial_replay_guards_expiry
  on public.installation_financial_replay_guards(replay_expires_at);
create index if not exists idx_installation_financial_replay_guards_type_expiry
  on public.installation_financial_replay_guards(operation_type,replay_expires_at);

alter table public.installation_financial_replay_policy enable row level security;
alter table public.installation_financial_replay_guards enable row level security;
revoke all on table public.installation_financial_replay_policy from public,anon,authenticated;
revoke all on table public.installation_financial_replay_guards from public,anon,authenticated;
grant select on table public.installation_financial_replay_policy to service_role;
grant select on table public.installation_financial_replay_guards to service_role;

-- Backfill compact guards for all financial operations already committed before R40.
-- Result-ledger rows remain authoritative and can always return their stored result idempotently.
insert into public.installation_financial_replay_guards(
  user_id,operation_key,operation_type,payload_hash,first_server_attempt_at,replay_expires_at,policy_version,created_at,updated_at
)
select
  user_id,operation_key,operation_type,payload_hash,created_at,created_at + interval '90 days',
  'r40-financial-90d-v1',created_at,now()
from public.installation_financial_operations
on conflict (user_id,operation_key) do nothing;

create or replace function public.assert_installation_financial_replay_guard(
  p_operation_key text,
  p_operation_type text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  op_key text:=nullif(btrim(coalesce(p_operation_key,'')),'');
  op_type text:=nullif(btrim(coalesce(p_operation_type,'')),'');
  p_hash text:=nullif(btrim(coalesce(p_payload_hash,'')),'');
  v_policy public.installation_financial_replay_policy%rowtype;
  v_guard public.installation_financial_replay_guards%rowtype;
  v_now timestamptz:=now();
begin
  if uid is null then raise exception 'جلسة المستخدم غير صالحة'; end if;
  if op_key is null then raise exception 'معرّف العملية المالية مطلوب'; end if;
  if op_type is null or p_hash is null then raise exception 'بصمة العملية المالية غير مكتملة'; end if;

  select * into v_policy
  from public.installation_financial_replay_policy
  where policy_key='appointment_financial';
  if not found then raise exception 'FINANCIAL_REPLAY_POLICY_NOT_CONFIGURED'; end if;

  select * into v_guard
  from public.installation_financial_replay_guards
  where user_id=uid and operation_key=op_key
  for update;

  if found then
    if v_guard.operation_type<>op_type or v_guard.payload_hash<>p_hash then
      raise exception 'تمت إعادة استخدام معرّف العملية ببيانات مختلفة';
    end if;
    if v_now>v_guard.replay_expires_at then
      raise exception 'FINANCIAL_REPLAY_HORIZON_EXPIRED: انتهت مهلة إعادة المحاولة المالية. راجع حالة الموعد والفاتورة على الخادم قبل أي إجراء جديد.';
    end if;
    return jsonb_build_object(
      'ok',true,'replayAllowed',true,'policyVersion',v_guard.policy_version,
      'firstServerAttemptAt',v_guard.first_server_attempt_at,'replayExpiresAt',v_guard.replay_expires_at
    );
  end if;

  insert into public.installation_financial_replay_guards(
    user_id,operation_key,operation_type,payload_hash,first_server_attempt_at,replay_expires_at,policy_version
  ) values (
    uid,op_key,op_type,p_hash,v_now,v_now + make_interval(days=>v_policy.replay_horizon_days),v_policy.policy_version
  );

  return jsonb_build_object(
    'ok',true,'replayAllowed',true,'policyVersion',v_policy.policy_version,
    'firstServerAttemptAt',v_now,'replayExpiresAt',v_now + make_interval(days=>v_policy.replay_horizon_days)
  );
end;
$$;

revoke all on function public.assert_installation_financial_replay_guard(text,text,text) from public,anon,authenticated;
grant execute on function public.assert_installation_financial_replay_guard(text,text,text) to service_role;

create or replace function public.complete_installation_collection_stage_safe_v1(
  p_request_id uuid,
  p_visit_id uuid default null,
  p_amount_received numeric default 0,
  p_payment_method text default null,
  p_reference text default null,
  p_notes text default null,
  p_operation_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=auth.uid();
  op_key text:=nullif(btrim(coalesce(p_operation_key,'')),'');
  payload_hash text;
  existing public.installation_financial_operations%rowtype;
  result jsonb;
  collection_row public.installation_request_collection%rowtype;
  visit_ids uuid[];
begin
  if uid is null then raise exception 'جلسة المستخدم غير صالحة'; end if;
  if op_key is null then raise exception 'معرّف العملية المالية مطلوب'; end if;
  payload_hash:=md5(jsonb_build_object(
    'requestId',p_request_id,'visitId',p_visit_id,'amount',round(greatest(coalesce(p_amount_received,0),0),2),
    'paymentMethod',coalesce(p_payment_method,''),'reference',coalesce(p_reference,''),'notes',coalesce(p_notes,'')
  )::text);
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||op_key,0));
  select * into existing from public.installation_financial_operations where user_id=uid and operation_key=op_key;
  if found then
    if existing.operation_type<>'collection' or existing.payload_hash<>payload_hash then raise exception 'تمت إعادة استخدام معرّف العملية ببيانات مختلفة'; end if;
    return existing.result||jsonb_build_object('idempotentReplay',true);
  end if;

  perform public.assert_installation_financial_replay_guard(op_key,'collection',payload_hash);

  perform public.complete_installation_collection_stage(p_request_id,p_visit_id,p_amount_received,p_payment_method,p_reference,p_notes);
  select * into collection_row from public.installation_request_collection where installation_request_id=p_request_id;
  if p_visit_id is not null then
    visit_ids:=public.get_installation_execution_group_visit_ids(p_request_id,p_visit_id);
    if coalesce(cardinality(visit_ids),0)=0 then visit_ids:=array[p_visit_id]; end if;
  else visit_ids:=array[]::uuid[]; end if;
  result:=jsonb_build_object(
    'ok',true,'amountCollected',coalesce(collection_row.amount_collected,0),'collectionAt',collection_row.collected_at,
    'paymentMethod',collection_row.payment_method,'visitIds',to_jsonb(visit_ids)
  );
  insert into public.installation_financial_operations(user_id,operation_key,operation_type,installation_request_id,installation_execution_visit_id,payload_hash,result)
  values(uid,op_key,'collection',p_request_id,p_visit_id,payload_hash,result);
  return result;
end;
$$;

create or replace function public.recover_installation_completion_collection_stage_safe_v1(
  p_request_id uuid,p_visit_id uuid,p_amount_collected numeric,p_payment_method text,p_notes text default null,p_operation_key text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); op_key text:=nullif(btrim(coalesce(p_operation_key,'')),''); payload_hash text; existing public.installation_financial_operations%rowtype; result jsonb;
begin
  if uid is null then raise exception 'جلسة المستخدم غير صالحة'; end if; if op_key is null then raise exception 'معرّف العملية المالية مطلوب'; end if;
  payload_hash:=md5(jsonb_build_object('requestId',p_request_id,'visitId',p_visit_id,'amount',round(greatest(coalesce(p_amount_collected,0),0),2),'paymentMethod',coalesce(p_payment_method,''),'notes',coalesce(p_notes,''))::text);
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||op_key,0));
  select * into existing from public.installation_financial_operations where user_id=uid and operation_key=op_key;
  if found then if existing.operation_type<>'collection_recovery' or existing.payload_hash<>payload_hash then raise exception 'تمت إعادة استخدام معرّف العملية ببيانات مختلفة'; end if; return existing.result||jsonb_build_object('idempotentReplay',true); end if;
  perform public.assert_installation_financial_replay_guard(op_key,'collection_recovery',payload_hash);
  result:=public.recover_installation_completion_collection_stage(p_request_id,p_visit_id,p_amount_collected,p_payment_method,p_notes);
  insert into public.installation_financial_operations(user_id,operation_key,operation_type,installation_request_id,installation_execution_visit_id,payload_hash,result)
  values(uid,op_key,'collection_recovery',p_request_id,p_visit_id,payload_hash,coalesce(result,'{}'::jsonb));
  return coalesce(result,'{}'::jsonb);
end; $$;

create or replace function public.confirm_installation_actual_quantities_safe_v1(
  p_request_id uuid,p_visit_id uuid default null,p_grouped boolean default false,p_lines jsonb default '[]'::jsonb,
  p_remaining_action text default null,p_schedule jsonb default null,p_notes text default null,p_operation_key text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); op_key text:=nullif(btrim(coalesce(p_operation_key,'')),''); payload_hash text; existing public.installation_financial_operations%rowtype; result jsonb;
begin
  if uid is null then raise exception 'جلسة المستخدم غير صالحة'; end if; if op_key is null then raise exception 'معرّف العملية المالية مطلوب'; end if;
  payload_hash:=md5(jsonb_build_object('requestId',p_request_id,'visitId',p_visit_id,'grouped',coalesce(p_grouped,false),'lines',coalesce(p_lines,'[]'::jsonb),'remainingAction',coalesce(p_remaining_action,''),'schedule',coalesce(p_schedule,'null'::jsonb),'notes',coalesce(p_notes,''))::text);
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||op_key,0));
  select * into existing from public.installation_financial_operations where user_id=uid and operation_key=op_key;
  if found then if existing.operation_type<>'quantity_confirmation' or existing.payload_hash<>payload_hash then raise exception 'تمت إعادة استخدام معرّف العملية ببيانات مختلفة'; end if; return existing.result||jsonb_build_object('idempotentReplay',true); end if;
  perform public.assert_installation_financial_replay_guard(op_key,'quantity_confirmation',payload_hash);
  if p_visit_id is null then
    result:=public.confirm_installation_actual_quantities(p_request_id,coalesce(p_lines,'[]'::jsonb),p_remaining_action,p_schedule,p_notes);
  elsif coalesce(p_grouped,false) then
    result:=public.confirm_installation_execution_group_quantities_v2(p_request_id,p_visit_id,coalesce(p_lines,'[]'::jsonb),p_remaining_action,p_schedule,p_notes);
  else
    result:=public.confirm_installation_execution_visit_quantities(p_request_id,p_visit_id,coalesce(p_lines,'[]'::jsonb),p_remaining_action,p_schedule,p_notes);
  end if;
  insert into public.installation_financial_operations(user_id,operation_key,operation_type,installation_request_id,installation_execution_visit_id,payload_hash,result)
  values(uid,op_key,'quantity_confirmation',p_request_id,p_visit_id,payload_hash,coalesce(result,'{}'::jsonb));
  return coalesce(result,'{}'::jsonb);
end; $$;

create or replace function public.confirm_installation_execution_and_create_invoice_safe_v1(
  p_request_id uuid,p_visit_id uuid,p_grouped boolean default false,p_lines jsonb default '[]'::jsonb,
  p_remaining_action text default null,p_schedule jsonb default null,p_notes text default null,
  p_invoice_number text default null,p_invoice_date date default current_date,p_without_invoice boolean default false,p_operation_key text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); op_key text:=nullif(btrim(coalesce(p_operation_key,'')),''); payload_hash text; existing public.installation_financial_operations%rowtype; result jsonb;
begin
  if uid is null then raise exception 'جلسة المستخدم غير صالحة'; end if; if op_key is null then raise exception 'معرّف العملية المالية مطلوب'; end if;
  payload_hash:=md5(jsonb_build_object('requestId',p_request_id,'visitId',p_visit_id,'grouped',coalesce(p_grouped,false),'lines',coalesce(p_lines,'[]'::jsonb),'remainingAction',coalesce(p_remaining_action,''),'schedule',coalesce(p_schedule,'null'::jsonb),'notes',coalesce(p_notes,''),'invoiceNumber',coalesce(p_invoice_number,''),'invoiceDate',p_invoice_date,'withoutInvoice',coalesce(p_without_invoice,false))::text);
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||op_key,0));
  select * into existing from public.installation_financial_operations where user_id=uid and operation_key=op_key;
  if found then if existing.operation_type<>'quantity_invoice' or existing.payload_hash<>payload_hash then raise exception 'تمت إعادة استخدام معرّف العملية ببيانات مختلفة'; end if; return existing.result||jsonb_build_object('idempotentReplay',true); end if;
  perform public.assert_installation_financial_replay_guard(op_key,'quantity_invoice',payload_hash);
  if coalesce(p_grouped,false) then
    result:=public.confirm_installation_execution_group_and_create_invoice_v5(p_request_id,p_visit_id,coalesce(p_lines,'[]'::jsonb),p_remaining_action,p_schedule,p_notes,p_invoice_number,p_invoice_date,p_without_invoice);
  else
    result:=public.confirm_installation_execution_visit_and_create_invoice_v4(p_request_id,p_visit_id,coalesce(p_lines,'[]'::jsonb),p_remaining_action,p_schedule,p_notes,p_invoice_number,p_invoice_date,p_without_invoice);
  end if;
  insert into public.installation_financial_operations(user_id,operation_key,operation_type,installation_request_id,installation_execution_visit_id,payload_hash,result)
  values(uid,op_key,'quantity_invoice',p_request_id,p_visit_id,payload_hash,coalesce(result,'{}'::jsonb));
  return coalesce(result,'{}'::jsonb);
end; $$;

create or replace function public.cancel_installation_execution_visit_confirmation_safe_v1(
  p_request_id uuid,p_visit_ids uuid[],p_reason text default null,p_operation_key text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); op_key text:=nullif(btrim(coalesce(p_operation_key,'')),''); payload_hash text; existing public.installation_financial_operations%rowtype; result jsonb; normalized_visit_ids uuid[]; anchor_visit_id uuid;
begin
  if uid is null then raise exception 'جلسة المستخدم غير صالحة'; end if; if op_key is null then raise exception 'معرّف العملية المالية مطلوب'; end if;
  select coalesce(array_agg(x order by x),array[]::uuid[]) into normalized_visit_ids from (select distinct unnest(coalesce(p_visit_ids,array[]::uuid[])) x) q;
  if coalesce(cardinality(normalized_visit_ids),0)=0 then raise exception 'بيانات زيارة التنفيذ غير مكتملة'; end if;
  anchor_visit_id:=normalized_visit_ids[1];
  payload_hash:=md5(jsonb_build_object('requestId',p_request_id,'visitIds',to_jsonb(normalized_visit_ids),'reason',coalesce(p_reason,''))::text);
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||op_key,0));
  select * into existing from public.installation_financial_operations where user_id=uid and operation_key=op_key;
  if found then if existing.operation_type<>'quantity_confirmation_cancel' or existing.payload_hash<>payload_hash then raise exception 'تمت إعادة استخدام معرّف العملية ببيانات مختلفة'; end if; return existing.result||jsonb_build_object('idempotentReplay',true); end if;
  perform public.assert_installation_financial_replay_guard(op_key,'quantity_confirmation_cancel',payload_hash);
  perform public.cancel_installation_execution_visit_confirmation_group(p_request_id,normalized_visit_ids,p_reason);
  result:=jsonb_build_object('ok',true,'visitIds',to_jsonb(normalized_visit_ids));
  insert into public.installation_financial_operations(user_id,operation_key,operation_type,installation_request_id,installation_execution_visit_id,payload_hash,result)
  values(uid,op_key,'quantity_confirmation_cancel',p_request_id,anchor_visit_id,payload_hash,result);
  return result;
end; $$;

create or replace function public.create_sales_invoice_from_installation_visit_safe_v1(
  p_installation_request_id uuid,p_visit_id uuid,p_invoice_number text,p_invoice_date date,p_without_invoice boolean default false,p_operation_key text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); op_key text:=nullif(btrim(coalesce(p_operation_key,'')),''); payload_hash text; existing public.installation_financial_operations%rowtype; invoice_row public.sales_invoices%rowtype; result jsonb;
begin
  if uid is null then raise exception 'جلسة المستخدم غير صالحة'; end if; if op_key is null then raise exception 'معرّف العملية المالية مطلوب'; end if;
  payload_hash:=md5(jsonb_build_object('requestId',p_installation_request_id,'visitId',p_visit_id,'invoiceNumber',coalesce(p_invoice_number,''),'invoiceDate',p_invoice_date,'withoutInvoice',coalesce(p_without_invoice,false))::text);
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||op_key,0));
  select * into existing from public.installation_financial_operations where user_id=uid and operation_key=op_key;
  if found then if existing.operation_type<>'visit_invoice' or existing.payload_hash<>payload_hash then raise exception 'تمت إعادة استخدام معرّف العملية ببيانات مختلفة'; end if; return existing.result||jsonb_build_object('idempotentReplay',true); end if;
  perform public.assert_installation_financial_replay_guard(op_key,'visit_invoice',payload_hash);
  select * into invoice_row from public.create_sales_invoice_from_installation_group_v3(p_installation_request_id,p_visit_id,p_invoice_number,p_invoice_date,p_without_invoice);
  result:=to_jsonb(invoice_row);
  insert into public.installation_financial_operations(user_id,operation_key,operation_type,installation_request_id,installation_execution_visit_id,payload_hash,result)
  values(uid,op_key,'visit_invoice',p_installation_request_id,p_visit_id,payload_hash,result);
  return result;
end; $$;

create or replace function public.save_installation_completion_and_invoice_safe_v1(
  p_request_id uuid,p_work_summary text,p_recipient_name text,p_invoice_number text,p_invoice_date date,p_operation_key text default null
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); op_key text:=nullif(btrim(coalesce(p_operation_key,'')),''); payload_hash text; existing public.installation_financial_operations%rowtype; report_row public.installation_completion_reports%rowtype; invoice_row public.sales_invoices%rowtype; result jsonb;
begin
  if uid is null then raise exception 'جلسة المستخدم غير صالحة'; end if; if op_key is null then raise exception 'معرّف العملية المالية مطلوب'; end if;
  if not public.has_screen_permission('installationCompletion','edit') then raise exception 'لا توجد صلاحية تأكيد انتهاء المواعيد'; end if;
  if not public.has_screen_permission('salesInvoices','add') then raise exception 'لا توجد صلاحية إضافة فواتير المبيعات'; end if;
  if nullif(btrim(coalesce(p_work_summary,'')),'') is null then raise exception 'ملخص الأعمال المنفذة مطلوب'; end if;
  if nullif(btrim(coalesce(p_recipient_name,'')),'') is null then raise exception 'اسم مستلم الأعمال مطلوب'; end if;
  if nullif(btrim(coalesce(p_invoice_number,'')),'') is null then raise exception 'رقم الفاتورة مطلوب'; end if;
  if p_invoice_date is null then raise exception 'تاريخ الفاتورة مطلوب'; end if;
  payload_hash:=md5(jsonb_build_object('requestId',p_request_id,'workSummary',btrim(p_work_summary),'recipientName',btrim(p_recipient_name),'invoiceNumber',btrim(p_invoice_number),'invoiceDate',p_invoice_date)::text);
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||op_key,0));
  select * into existing from public.installation_financial_operations where user_id=uid and operation_key=op_key;
  if found then if existing.operation_type<>'legacy_completion_invoice' or existing.payload_hash<>payload_hash then raise exception 'تمت إعادة استخدام معرّف العملية ببيانات مختلفة'; end if; return existing.result||jsonb_build_object('idempotentReplay',true); end if;
  perform public.assert_installation_financial_replay_guard(op_key,'legacy_completion_invoice',payload_hash);

  insert into public.installation_completion_reports(installation_request_id,work_summary,recipient_name,invoice_number,invoice_date,recipient_role,customer_notes,signed_at)
  values(p_request_id,btrim(p_work_summary),btrim(p_recipient_name),btrim(p_invoice_number),p_invoice_date,null,null,null)
  on conflict (installation_request_id) do update set work_summary=excluded.work_summary,recipient_name=excluded.recipient_name,invoice_number=excluded.invoice_number,invoice_date=excluded.invoice_date
  returning * into report_row;
  select * into invoice_row from public.sync_sales_invoice_from_installation(p_request_id);
  result:=jsonb_build_object('ok',true,'reportId',report_row.id,'invoice',to_jsonb(invoice_row));
  insert into public.installation_financial_operations(user_id,operation_key,operation_type,installation_request_id,installation_execution_visit_id,payload_hash,result)
  values(uid,op_key,'legacy_completion_invoice',p_request_id,null,payload_hash,result);
  return result;
end; $$;

revoke all on function public.complete_installation_collection_stage_safe_v1(uuid,uuid,numeric,text,text,text,text) from public,anon;
grant execute on function public.complete_installation_collection_stage_safe_v1(uuid,uuid,numeric,text,text,text,text) to authenticated;
revoke all on function public.recover_installation_completion_collection_stage_safe_v1(uuid,uuid,numeric,text,text,text) from public,anon;
grant execute on function public.recover_installation_completion_collection_stage_safe_v1(uuid,uuid,numeric,text,text,text) to authenticated;
revoke all on function public.confirm_installation_actual_quantities_safe_v1(uuid,uuid,boolean,jsonb,text,jsonb,text,text) from public,anon;
grant execute on function public.confirm_installation_actual_quantities_safe_v1(uuid,uuid,boolean,jsonb,text,jsonb,text,text) to authenticated;
revoke all on function public.confirm_installation_execution_and_create_invoice_safe_v1(uuid,uuid,boolean,jsonb,text,jsonb,text,text,date,boolean,text) from public,anon;
grant execute on function public.confirm_installation_execution_and_create_invoice_safe_v1(uuid,uuid,boolean,jsonb,text,jsonb,text,text,date,boolean,text) to authenticated;
revoke all on function public.cancel_installation_execution_visit_confirmation_safe_v1(uuid,uuid[],text,text) from public,anon;
grant execute on function public.cancel_installation_execution_visit_confirmation_safe_v1(uuid,uuid[],text,text) to authenticated;
revoke all on function public.create_sales_invoice_from_installation_visit_safe_v1(uuid,uuid,text,date,boolean,text) from public,anon;
grant execute on function public.create_sales_invoice_from_installation_visit_safe_v1(uuid,uuid,text,date,boolean,text) to authenticated;
revoke all on function public.save_installation_completion_and_invoice_safe_v1(uuid,text,text,text,date,text) from public,anon;
grant execute on function public.save_installation_completion_and_invoice_safe_v1(uuid,text,text,text,date,text) to authenticated;

-- Wrap R39 observability so Financial Retry is a bounded, server-enforced policy.
alter function public.get_sync_retention_observability_snapshot()
  rename to get_sync_retention_observability_snapshot_core_r40;

create or replace function public.get_sync_retention_observability_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_base jsonb;
  v_policy public.installation_financial_replay_policy%rowtype;
  v_now timestamptz:=now();
  v_guard_rows bigint:=0;
  v_expired_guards bigint:=0;
  v_financial_blockers jsonb:='[]'::jsonb;
  v_overall_blockers jsonb:='[]'::jsonb;
  v_observation_ok boolean:=false;
  v_rollout_ok boolean:=false;
  v_legacy_grace_active boolean:=false;
  v_next text;
  v_financial_status text:='HOLD';
begin
  v_base:=public.get_sync_retention_observability_snapshot_core_r40();

  select * into v_policy
  from public.installation_financial_replay_policy
  where policy_key='appointment_financial';
  if not found then return v_base; end if;

  select count(*),count(*) filter(where replay_expires_at < v_now)
    into v_guard_rows,v_expired_guards
  from public.installation_financial_replay_guards;

  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_financial_blockers
  from jsonb_array_elements(coalesce(v_base#>'{decisionGate,domains,installationFinancial,blockers}','[]'::jsonb)) value
  where value not in ('"FINANCIAL_RETRY_HORIZON_UNBOUNDED"'::jsonb,'"FINANCIAL_RETRY_POLICY_REQUIRED"'::jsonb);

  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_overall_blockers
  from jsonb_array_elements(coalesce(v_base#>'{decisionGate,blockers}','[]'::jsonb)) value
  where value not in ('"FINANCIAL_RETRY_HORIZON_UNBOUNDED"'::jsonb,'"FINANCIAL_RETRY_POLICY_REQUIRED"'::jsonb);

  v_observation_ok:=coalesce((v_base#>>'{decisionGate,observationWindowSatisfied}')::boolean,false);
  v_rollout_ok:=not (v_overall_blockers @> '["REPLAY_POLICY_ROLLOUT_INCOMPLETE"]'::jsonb);
  v_legacy_grace_active:=coalesce((v_base#>>'{decisionGate,legacyV1GraceActive}')::boolean,false);

  if v_observation_ok then v_financial_status:='READY'; end if;

  if v_legacy_grace_active then
    v_next:='WAIT_SERVER_LEGACY_REPLAY_GRACE';
  elsif not v_observation_ok or not v_rollout_ok then
    v_next:='WAIT_RETENTION_GATE_REQUIREMENTS';
  else
    v_next:='RETENTION_PRUNING_IMPLEMENTATION_PENDING';
  end if;

  v_base:=jsonb_set(v_base,'{readinessReason}','"FINANCIAL_RETRY_HORIZON_DEFINED_PRUNING_STILL_HOLD"'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,financialRetryHorizonBounded}','true'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,financialRetryHorizonDays}',to_jsonb(v_policy.replay_horizon_days),true);
  v_base:=jsonb_set(v_base,'{decisionGate,financialRetrySafetyBufferDays}',to_jsonb(v_policy.safety_buffer_days),true);
  v_base:=jsonb_set(v_base,'{decisionGate,financialCandidateRetentionDays}',to_jsonb(v_policy.replay_horizon_days+v_policy.safety_buffer_days),true);
  v_base:=jsonb_set(v_base,'{decisionGate,financialServerReplayEnforcementEnabled}','true'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,financialReplayPolicyVersion}',to_jsonb(v_policy.policy_version),true);
  v_base:=jsonb_set(v_base,'{decisionGate,financialReplayGuardRows}',to_jsonb(v_guard_rows),true);
  v_base:=jsonb_set(v_base,'{decisionGate,expiredFinancialReplayGuards}',to_jsonb(v_expired_guards),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,status}',to_jsonb(v_financial_status),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,replayHorizonBounded}','true'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,replayHorizonDays}',to_jsonb(v_policy.replay_horizon_days),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,candidateRetentionDays}',to_jsonb(v_policy.replay_horizon_days+v_policy.safety_buffer_days),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,serverReplayEnforcementEnabled}','true'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,guardRows}',to_jsonb(v_guard_rows),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,expiredGuards}',to_jsonb(v_expired_guards),true);
  v_base:=jsonb_set(v_base,'{decisionGate,domains,installationFinancial,blockers}',v_financial_blockers,true);
  v_base:=jsonb_set(v_base,'{decisionGate,blockers}',v_overall_blockers,true);
  v_base:=jsonb_set(v_base,'{decisionGate,nextDecisionRequired}',to_jsonb(v_next),true);

  -- S15 is a policy/enforcement phase only. Heavy idempotency result ledgers remain untouched.
  v_base:=jsonb_set(v_base,'{pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{retentionPolicy,ledgerPruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,pruningEnabled}','false'::jsonb,true);
  v_base:=jsonb_set(v_base,'{decisionGate,status}','"HOLD"'::jsonb,true);
  return v_base;
end;
$$;

revoke all on function public.get_sync_retention_observability_snapshot() from public,anon,authenticated;
grant execute on function public.get_sync_retention_observability_snapshot() to authenticated,service_role;

comment on table public.installation_financial_replay_guards is
  'R40 compact financial replay safety receipts. They do not contain financial result payloads and are not pruned in R40.';
comment on function public.assert_installation_financial_replay_guard(text,text,text) is
  'R40 server-pinned 90-day financial retry horizon. Existing result-ledger hits stay idempotent; stale re-execution without a result row is rejected.';
comment on function public.get_sync_retention_observability_snapshot() is
  'R40 super-admin observability with bounded 90-day Financial Retry Horizon and 120-day candidate result-ledger retention. Pruning remains disabled.';

notify pgrst,'reload schema';
commit;
