-- P5.13.8.72 R30 — Financial Appointment Boundary Hardening
-- Scope: keep appointment financial writes online-only while making retry after an ambiguous
-- network response idempotent. No offline financial queue is introduced.

begin;

create table if not exists public.installation_financial_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  operation_key text not null,
  operation_type text not null,
  installation_request_id uuid not null references public.installation_requests(id) on delete cascade,
  installation_execution_visit_id uuid null references public.installation_execution_visits(id) on delete set null,
  payload_hash text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint installation_financial_operations_type_chk check (operation_type in (
    'collection','collection_recovery','quantity_confirmation','quantity_invoice','quantity_confirmation_cancel','visit_invoice','legacy_completion_invoice'
  )),
  constraint installation_financial_operations_key_uniq unique(user_id,operation_key)
);
create index if not exists idx_installation_financial_operations_request
  on public.installation_financial_operations(installation_request_id,created_at desc);
create index if not exists idx_installation_financial_operations_visit
  on public.installation_financial_operations(installation_execution_visit_id,created_at desc)
  where installation_execution_visit_id is not null;

alter table public.installation_financial_operations enable row level security;
revoke all on table public.installation_financial_operations from public,anon,authenticated;
grant select on table public.installation_financial_operations to service_role;

-- Financial evidence uploaded before the database financial commit is keyed to the same
-- client operation. A manual retry after an ambiguous response reuses the prior evidence row
-- instead of creating a second visible attachment. Existing non-financial uploads remain unchanged.
alter table public.installation_execution_files
  add column if not exists client_evidence_key text;
create unique index if not exists uq_installation_execution_files_client_evidence
  on public.installation_execution_files(client_evidence_key)
  where client_evidence_key is not null;

alter table public.installation_completion_files
  add column if not exists client_evidence_key text;
create unique index if not exists uq_installation_completion_files_client_evidence
  on public.installation_completion_files(client_evidence_key)
  where client_evidence_key is not null;

-- Collection: the canonical RPC is cumulative, so a committed response that is lost on the
-- network must never be replayed as a second collection amount.
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

notify pgrst,'reload schema';
commit;
