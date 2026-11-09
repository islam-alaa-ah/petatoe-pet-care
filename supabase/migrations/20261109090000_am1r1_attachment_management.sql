-- AM1R1. Supersedes the UNINSTALLED AM1 candidate. Never apply over an installed AM1.
-- Review 00_PRECHECK_READONLY.sql + the supplied AM1-AUDIT-02 result before use.
-- Installed disabled. No legacy policies, function definitions or business rows change.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if to_regnamespace('petatoe_am1') is not null then
    raise exception 'AM1_ALREADY_INSTALLED: use VERIFY; do not rerun installation';
  end if;
end $$;
create schema petatoe_am1;
revoke all on schema petatoe_am1 from public, anon, authenticated;
create table petatoe_am1.config (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  deletion_enabled boolean not null default false,
  revision text not null default 'AM1R1' check(revision='AM1R1'),
  installed_at timestamptz not null default now()
);
insert into petatoe_am1.config(id) values(true);
create table petatoe_am1.archives (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  month text not null check(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'preparing' check(status in ('preparing','ready','confirmed','purging','purged','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '2 hours',
  ready_at timestamptz,
  confirmed_at timestamptz,
  pdf_sha256 text,
  pdf_bytes bigint,
  file_name text,
  batch_token uuid,
  batch_until timestamptz,
  item_count integer not null default 0
);
create table petatoe_am1.items (
  archive_id uuid not null references petatoe_am1.archives(id),
  ordinal integer not null,
  object_id uuid not null,
  bucket_id text not null,
  path text not null,
  object_version text not null check(length(object_version)>0),
  fingerprint text not null,
  snapshot jsonb not null,
  protected boolean not null,
  original_sha256 text,
  version_bound_at timestamptz,
  delete_requested_at timestamptz,
  deleted_at timestamptz,
  last_error text,
  primary key(archive_id,ordinal),
  unique(archive_id,object_id)
);
create index am1_items_path on petatoe_am1.items(bucket_id,path) where deleted_at is not null;
create table petatoe_am1.leases (
  bucket_id text not null, path text not null,
  archive_id uuid not null references petatoe_am1.archives(id),
  expires_at timestamptz not null,
  primary key(bucket_id,path)
);
create table petatoe_am1.events (
  id bigint generated always as identity primary key,
  archive_id uuid references petatoe_am1.archives(id),
  actor_id uuid not null, action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table petatoe_am1.config enable row level security;
alter table petatoe_am1.archives enable row level security;
alter table petatoe_am1.items enable row level security;
alter table petatoe_am1.leases enable row level security;
alter table petatoe_am1.events enable row level security;
revoke all on all tables in schema petatoe_am1 from public, anon, authenticated;
revoke all on all sequences in schema petatoe_am1 from public, anon, authenticated;

-- One temporary lock for exact objects being exported/purged. No bucket-wide lock.
-- Runs AFTER row locking, before a mutation. Unlike a separate client check, this
-- also covers other tabs, direct Storage calls and upserts racing the archive.
-- Does not depend on the Storage backend retaining the caller's JWT role while
-- it writes metadata. Only the exact approved purge DELETE is allowed through.
-- Administrators who disable triggers can override; do not do that during AM1.
create function petatoe_am1.guard_object() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare b text; p text;
begin
  if tg_op='UPDATE' and (to_jsonb(new)-array['last_accessed_at','updated_at'])=(to_jsonb(old)-array['last_accessed_at','updated_at']) then
    return new; -- access bookkeeping alone must not block a legitimate image read.
  end if;
  if tg_op='DELETE' and exists(
    select 1 from petatoe_am1.leases l join petatoe_am1.items i on i.archive_id=l.archive_id and i.bucket_id=l.bucket_id and i.path=l.path
    join petatoe_am1.archives a on a.id=i.archive_id
    where l.bucket_id=old.bucket_id and l.path=old.name and l.expires_at='infinity'::timestamptz
      and a.status='purging' and a.confirmed_at is not null and not i.protected and i.deleted_at is null
      and i.delete_requested_at is not null and i.object_id=old.id and i.object_version=old.version
  ) then
    return old;
  end if;
  if tg_op<>'INSERT' then
    if exists(select 1 from petatoe_am1.leases l where l.bucket_id=old.bucket_id and l.path=old.name and l.expires_at>clock_timestamp()) then
      raise exception 'AM1_OBJECT_ARCHIVING: retry after the monthly archive finishes' using errcode='55000';
    end if;
  end if;
  if tg_op<>'DELETE' then
    b:=new.bucket_id; p:=new.name;
    if exists(select 1 from petatoe_am1.leases l where l.bucket_id=b and l.path=p and l.expires_at>clock_timestamp()) then
      raise exception 'AM1_OBJECT_ARCHIVING: retry after the monthly archive finishes' using errcode='55000';
    end if;
    return new;
  end if;
  return old;
end $$;
revoke all on function petatoe_am1.guard_object() from public,anon,authenticated;
create trigger petatoe_am1_archive_guard before insert or update or delete on storage.objects
for each row execute function petatoe_am1.guard_object();

create function petatoe_am1.is_image(o jsonb) returns boolean
language sql immutable set search_path=pg_catalog as $$
select (o->>'archived_at') is null and coalesce((o->>'is_delete_marker')::boolean,false)=false
 and (lower(coalesce(o->'metadata'->>'mimetype','')) like 'image/%'
  or (coalesce(o->'metadata'->>'mimetype','') in ('','application/octet-stream')
      and lower(o->>'name') ~ '\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?|svg)$'))
$$;
-- Only supported current, unversioned buckets may enter an archive/purge.
-- A populated physical version column DOES NOT mean bucket versioning is enabled.
create function petatoe_am1.bucket_supported(b text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from storage.buckets where id=b and type::text='STANDARD' and versioning_status='DISABLED')
$$;
-- The provider content timestamp is evidence of content upload/replacement.
-- Row updated_at is deliberately excluded: managed bookkeeping updates change it.
create function petatoe_am1.content_time(o jsonb) returns timestamptz
language plpgsql stable set search_path=pg_catalog as $$
declare v text:=o->'metadata'->>'lastModified';
begin
 if v ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
  begin return v::timestamptz; exception when invalid_datetime_format or datetime_field_overflow then null; end;
 end if;
 begin return (o->>'created_at')::timestamptz; exception when invalid_datetime_format or datetime_field_overflow then return null; end;
end $$;
create function petatoe_am1.content_time_evidence(o jsonb) returns text
language plpgsql stable set search_path=pg_catalog as $$
declare v text:=o->'metadata'->>'lastModified'; t timestamptz;
begin
 if v ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then
  begin t:=v::timestamptz; return 'metadata.lastModified'; exception when invalid_datetime_format or datetime_field_overflow then null; end;
 end if;
 if petatoe_am1.content_time(o) is null then return 'not_recorded'; end if;
 return 'storage.created_at';
end $$;
-- Ignore only row bookkeeping timestamps, retain physical/content identity.
create function petatoe_am1.fingerprint(o jsonb) returns text
language sql immutable set search_path=pg_catalog as $$
select md5(jsonb_build_object('id',o->'id','bucket',o->'bucket_id','name',o->'name',
 'created',o->'created_at','version',o->'version',
 'archived_at',o->'archived_at','is_delete_marker',o->'is_delete_marker','is_versioned',o->'is_versioned',
 'metadata',o->'metadata','user_metadata',o->'user_metadata','owner',o->'owner','owner_id',o->'owner_id')::text)
$$;

-- All lookups are read-only. Exact storage_path joins; never infer a customer
-- or uploader from a file name. JSON access tolerates optional legacy columns.
create function petatoe_am1.describe_object(o jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare f jsonb; entity jsonb; req jsonb; cust jsonb; trip jsonb; uploader jsonb;
  uid text; matches integer:=0; source text:='unmapped'; protect boolean:=true; b text:=o->>'bucket_id'; p text:=o->>'name';
begin
  if b='installation-evidence' then
    select (select count(*) from public.installation_execution_files where storage_path=p)+(select count(*) from public.installation_completion_files where storage_path=p) into matches;
    select to_jsonb(x) into f from public.installation_execution_files x where x.storage_path=p limit 1;
    if f is not null then source:='installation_execution_files'; end if;
    if f is null then
      select to_jsonb(x) into f from public.installation_completion_files x where x.storage_path=p limit 1;
      if f is not null then source:='installation_completion_files'; end if;
    end if;
    if f is not null then
      select to_jsonb(x) into req from public.installation_requests x where x.id::text=f->>'installation_request_id';
      select to_jsonb(x) into cust from public.customers x where x.id::text=req->>'customer_id';
      entity:=req; protect:=false;
    end if;
  elsif b='sea-vibe-expenses' then
    select count(*) into matches from public.sea_vibe_expense_attachments where storage_path=p;
    select to_jsonb(x) into f from public.sea_vibe_expense_attachments x where x.storage_path=p order by x.created_at desc limit 1;
    if f is not null then
      source:='sea_vibe_expense_attachments'; protect:=false;
      select to_jsonb(x) into entity from public.sea_vibe_expenses x where x.id::text=f->>'expense_id';
      select to_jsonb(x) into trip from public.sea_vibe_trips x where x.id::text=entity->>'trip_id';
    end if;
  elsif b='sea-vibe-treasury-vouchers' then
    select count(*) into matches from public.sea_vibe_treasury_voucher_attachments where storage_path=p;
    select to_jsonb(x) into f from public.sea_vibe_treasury_voucher_attachments x where x.storage_path=p order by x.created_at desc limit 1;
    if f is not null then
      source:='sea_vibe_treasury_voucher_attachments'; protect:=false;
      select to_jsonb(x) into entity from public.sea_vibe_treasury_vouchers x where x.id::text=f->>'voucher_id';
    end if;
  elsif b='sea-vibe-journal-entries' then
    select count(*) into matches from public.sea_vibe_journal_entry_attachments where storage_path=p;
    select to_jsonb(x) into f from public.sea_vibe_journal_entry_attachments x where x.storage_path=p limit 1;
    if f is not null then
      source:='sea_vibe_journal_entry_attachments'; protect:=false;
      select to_jsonb(x) into entity from public.sea_vibe_journal_entries x where x.id::text=f->>'journal_entry_id';
    end if;
  elsif b='user-whatsapp-templates' then
    select count(*) into matches from public.user_whatsapp_templates where image_path=p;
    select to_jsonb(x) into f from public.user_whatsapp_templates x where x.image_path=p limit 1;
    source:='user_whatsapp_templates'; -- protected: an active personal template is not disposable evidence.
  end if;
  if trip is not null then
    select to_jsonb(x) into cust from public.sea_vibe_customers x where x.id::text=trip->>'customer_id';
  end if;
  if matches>1 then source:='ambiguous'; f:=null; entity:=null; req:=null; cust:=null; trip:=null; protect:=true; end if;
  -- Unknown/missing source relationships are visible but never disposable.
  if source<>'user_whatsapp_templates' and (f is null or entity is null) then protect:=true; end if;
  if (req->>'customer_id' is not null or trip->>'customer_id' is not null) and cust is null then protect:=true; end if;
  if b='sea-vibe-expenses' and entity->>'trip_id' is not null and trip is null then protect:=true; end if;
  if not petatoe_am1.bucket_supported(b) or coalesce((o->>'is_versioned')::boolean,false)
     or nullif(o->>'version','') is null or petatoe_am1.content_time(o) is null then protect:=true; end if;
  uid:=coalesce(nullif(f->>'uploaded_by',''),nullif(f->>'created_by',''),nullif(f->>'user_id',''),nullif(o->>'owner_id',''),nullif(o->>'owner',''));
  select jsonb_build_object('id',x.id,'name',x.full_name) into uploader from public.user_profiles x where x.id::text=uid;
  return jsonb_build_object(
    'objectId',o->>'id','objectVersion',o->>'version','bucket',b,'path',p,'fileName',coalesce(f->>'original_name',f->>'file_name',f->>'image_name',regexp_replace(p,'^.*/','')),
    'mimeType',coalesce(o->'metadata'->>'mimetype',f->>'mime_type',f->>'image_mime',''),
    'bytes',coalesce(o->'metadata'->'size','0'::jsonb),
    'uploadedAt',petatoe_am1.content_time(o),'uploadTimeEvidence',petatoe_am1.content_time_evidence(o),
    'firstUploadedAt',o->>'created_at','recordedAt',coalesce(f->>'uploaded_at',f->>'created_at'),
    'updatedAt',o->>'updated_at','uploader',coalesce(uploader,jsonb_build_object('id',uid,'name',null)),
    'uploaderEvidence',case when nullif(f->>'uploaded_by','') is not null then 'attachment_uploader' when nullif(f->>'created_by','') is not null then 'attachment_creator' when nullif(f->>'user_id','') is not null then 'template_owner' when uid is not null then 'storage_owner' else 'not_recorded' end,
    'customer',case when cust is null then null else jsonb_build_object('id',cust->>'id','name',coalesce(cust->>'customer_name',cust->>'full_name'),'number',coalesce(cust->>'customer_number',cust->>'customer_code')) end,
    'reference',coalesce(req->>'request_number',trip->>'trip_serial',entity->>'voucher_no',entity->>'journal_no',entity->>'id'),
    'source',source,'sourceMatches',matches,'protected',protect,'protectionReason',case when b='user-whatsapp-templates' then 'ACTIVE_TEMPLATE' when matches>1 then 'AMBIGUOUS_REQUIRES_REVIEW' when not petatoe_am1.bucket_supported(b) or coalesce((o->>'is_versioned')::boolean,false) then 'BUCKET_MODE_UNSUPPORTED' when nullif(o->>'version','') is null or petatoe_am1.content_time(o) is null then 'IDENTITY_OR_TIME_UNAVAILABLE' when protect then 'UNMAPPED_REQUIRES_REVIEW' else null end,
    'metadata',jsonb_build_object('attachment',f,'relatedRecord',entity,'trip',trip,'storage',jsonb_build_object('id',o->'id','created_at',o->'created_at','updated_at',o->'updated_at','owner_id',uid,'version',o->'version','metadata',o->'metadata','user_metadata',o->'user_metadata'))
  );
end $$;

-- Only the authenticated server calls this RPC. Actor always comes from
-- auth.getUser(token) in the Edge function, never from a submitted JSON body.
create function public.petatoe_attachment_admin_am1(p_actor uuid,p_action text,p_input jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare cfg petatoe_am1.config%rowtype; a petatoe_am1.archives%rowtype; it petatoe_am1.items%rowtype;
  role_name text; month_key text; start_at timestamptz; end_at timestamptz; aid uuid;
  arr jsonb; ar jsonb; o jsonb; item jsonb; current_object jsonb; n integer; offst integer;
  bytes_count bigint; sha text; ord integer; count_items integer; token text;
begin
  if p_input->>'revision' is distinct from 'AM1R1' then raise exception 'AM1_REVISION_MISMATCH'; end if;
  if p_actor is null or not exists(select 1 from public.user_profiles u where u.id=p_actor and u.is_active=true and u.role::text='super_admin') then
    raise exception 'AM1_FORBIDDEN' using errcode='42501';
  end if;
  select * into cfg from petatoe_am1.config where id=true;
  if not found or cfg.enabled is not true then raise exception 'AM1_NOT_ENABLED'; end if;
  if p_action='preview' then
    select to_jsonb(x) into o from storage.objects x where x.id=(p_input->>'objectId')::uuid;
    if o is null or not petatoe_am1.is_image(o) then raise exception 'AM1_IMAGE_UNAVAILABLE'; end if;
    return petatoe_am1.describe_object(o);
  end if;
  if p_action='status' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into arr from
      (select id,month,status,created_at,confirmed_at,file_name,pdf_sha256,pdf_bytes,item_count,
        (select count(*) from petatoe_am1.items i where i.archive_id=z.id and not i.protected and i.deleted_at is null) as remaining,
        (select count(*) from petatoe_am1.items i where i.archive_id=z.id and i.protected) as protected_count
       from petatoe_am1.archives z where actor_id=p_actor and status<>'cancelled' order by created_at desc limit 30)t;
    return jsonb_build_object('runtime','AM1R1','deletionEnabled',cfg.deletion_enabled,'timezone','Asia/Riyadh','archives',arr,
      'currentMonth',to_char(clock_timestamp() at time zone 'Asia/Riyadh','YYYY-MM'));
  end if;
  if p_action in ('list','begin') then
    month_key:=p_input->>'month';
    if p_action='list' and coalesce(month_key,'')='' then
      start_at:='-infinity'::timestamptz; end_at:='infinity'::timestamptz;
    else
      if month_key is null or month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or substring(month_key,1,4)::int not between 2000 and 2100 then raise exception 'AM1_INVALID_MONTH'; end if;
      start_at:=(month_key||'-01')::timestamp at time zone 'Asia/Riyadh';
      end_at:=((month_key||'-01')::date+interval '1 month')::timestamp at time zone 'Asia/Riyadh';
    end if;
    if p_action='list' then
      offst:=greatest(0,least(1000000,coalesce((p_input->>'offset')::int,0)));
      select coalesce(jsonb_agg(petatoe_am1.describe_object(s.o) order by s.created_at,s.id),'[]'::jsonb) into arr from
        (select to_jsonb(x) o,petatoe_am1.content_time(to_jsonb(x)) created_at,x.id from storage.objects x
         where petatoe_am1.is_image(to_jsonb(x)) and (coalesce(month_key,'')='' or (petatoe_am1.content_time(to_jsonb(x))>=start_at and petatoe_am1.content_time(to_jsonb(x))<end_at))
         order by petatoe_am1.content_time(to_jsonb(x)) nulls last,x.id limit 51 offset offst)s;
      return jsonb_build_object('items',case when jsonb_array_length(arr)>50 then arr-50 else arr end,'hasMore',jsonb_array_length(arr)>50,'offset',offst,'month',month_key);
    end if;
    if clock_timestamp()<end_at then raise exception 'AM1_MONTH_NOT_CLOSED'; end if;
    select count(*),coalesce(sum(coalesce((x.metadata->>'size')::bigint,0)),0) into n,bytes_count from storage.objects x
      where petatoe_am1.content_time(to_jsonb(x))>=start_at and petatoe_am1.content_time(to_jsonb(x))<end_at and petatoe_am1.is_image(to_jsonb(x));
    if n=0 then raise exception 'AM1_EMPTY_MONTH'; end if;
    if n>5000 or bytes_count>2147483648 then raise exception 'AM1_EXPORT_TOO_LARGE'; end if;
    insert into petatoe_am1.archives(actor_id,month,item_count) values(p_actor,month_key,n) returning id into aid;
    ord:=0; bytes_count:=0;
    for o in select to_jsonb(x) from storage.objects x where petatoe_am1.content_time(to_jsonb(x))>=start_at and petatoe_am1.content_time(to_jsonb(x))<end_at and petatoe_am1.is_image(to_jsonb(x)) order by petatoe_am1.content_time(to_jsonb(x)),x.id for update loop
      ord:=ord+1; item:=petatoe_am1.describe_object(o);
      if not petatoe_am1.bucket_supported(o->>'bucket_id') or coalesce((o->>'is_versioned')::boolean,false) then raise exception 'AM1_BUCKET_MODE_UNSUPPORTED'; end if;
      if nullif(o->>'version','') is null then raise exception 'AM1_VERSION_READ_UNSUPPORTED'; end if;
      bytes_count:=bytes_count+coalesce((o->'metadata'->>'size')::bigint,0);
      if ord>5000 or bytes_count>2147483648 then raise exception 'AM1_EXPORT_TOO_LARGE'; end if;
      insert into petatoe_am1.items(archive_id,ordinal,object_id,bucket_id,path,object_version,fingerprint,snapshot,protected)
      values(aid,ord,(o->>'id')::uuid,o->>'bucket_id',o->>'name',o->>'version',petatoe_am1.fingerprint(o),item,(item->>'protected')::boolean);
      if not (item->>'protected')::boolean then
        insert into petatoe_am1.leases(bucket_id,path,archive_id,expires_at) values(o->>'bucket_id',o->>'name',aid,clock_timestamp()+interval '2 hours')
        on conflict(bucket_id,path) do update set archive_id=excluded.archive_id,expires_at=excluded.expires_at where petatoe_am1.leases.expires_at<=clock_timestamp();
        if not found then raise exception 'AM1_ARCHIVE_BUSY'; end if;
      end if;
    end loop;
    if ord=0 then raise exception 'AM1_EMPTY_MONTH'; end if;
    update petatoe_am1.archives set item_count=ord where id=aid;
    insert into petatoe_am1.events(archive_id,actor_id,action,details) values(aid,p_actor,'begin',jsonb_build_object('month',month_key,'count',ord));
    return jsonb_build_object('id',aid,'count',ord,'bytes',bytes_count,'month',month_key,'timezone','Asia/Riyadh','capturedAt',clock_timestamp());
  end if;
  aid:=(p_input->>'archiveId')::uuid;
  select * into a from petatoe_am1.archives where id=aid and actor_id=p_actor for update;
  if not found then raise exception 'AM1_ARCHIVE_NOT_FOUND'; end if;
  if p_action='cancel' then
    if a.status not in ('preparing','ready') then raise exception 'AM1_INVALID_STATE'; end if;
    update petatoe_am1.archives set status='cancelled' where id=aid;
    delete from petatoe_am1.leases where archive_id=aid;
    return jsonb_build_object('cancelled',true);
  elsif p_action in ('item','item_signed') then
    if a.status<>'preparing' or a.expires_at<=clock_timestamp() then raise exception 'AM1_EXPORT_EXPIRED'; end if;
    select * into it from petatoe_am1.items where archive_id=aid and ordinal=(p_input->>'ordinal')::int;
    if not found then raise exception 'AM1_ITEM_NOT_FOUND'; end if;
    select to_jsonb(x) into current_object from storage.objects x where x.id=it.object_id;
    if current_object is null or not petatoe_am1.is_image(current_object) or petatoe_am1.fingerprint(current_object)<>it.fingerprint then raise exception 'AM1_OBJECT_CHANGED'; end if;
    if not petatoe_am1.bucket_supported(it.bucket_id) then raise exception 'AM1_BUCKET_MODE_UNSUPPORTED'; end if;
    if p_action='item_signed' then
      if p_input->>'boundVersion' is distinct from it.object_version then raise exception 'AM1_VERSION_READ_UNSUPPORTED'; end if;
      update petatoe_am1.items set version_bound_at=clock_timestamp() where archive_id=aid and ordinal=it.ordinal;
      return jsonb_build_object('bound',true);
    end if;
    return it.snapshot||jsonb_build_object('ordinal',it.ordinal,'fingerprint',it.fingerprint);
  elsif p_action='complete' then
    if a.status<>'preparing' or a.expires_at<=clock_timestamp() then raise exception 'AM1_EXPORT_EXPIRED'; end if;
    sha:=p_input->>'sha256'; bytes_count:=(p_input->>'bytes')::bigint; arr:=p_input->'originals';
    if sha is null or sha !~ '^[a-f0-9]{64}$' or bytes_count is null or bytes_count<500 or bytes_count>4294967296 or arr is null or jsonb_typeof(arr)<>'array' or jsonb_array_length(arr)<>a.item_count then raise exception 'AM1_INVALID_RECEIPT'; end if;
    if exists(select 1 from petatoe_am1.items i left join storage.objects x on x.id=i.object_id where i.archive_id=aid and (x.id is null or petatoe_am1.fingerprint(to_jsonb(x))<>i.fingerprint)) then raise exception 'AM1_OBJECT_CHANGED'; end if;
    if exists(select 1 from petatoe_am1.items i where i.archive_id=aid and i.version_bound_at is null) then raise exception 'AM1_VERSION_READ_UNSUPPORTED'; end if;
    if exists(select 1 from petatoe_am1.items i where i.archive_id=aid and not petatoe_am1.bucket_supported(i.bucket_id)) then raise exception 'AM1_BUCKET_MODE_UNSUPPORTED'; end if;
    for it in select * from petatoe_am1.items where archive_id=aid order by ordinal loop
      item:=arr->(it.ordinal-1);
      if (item->>'ordinal')::int is distinct from it.ordinal or (item->>'sha256') is null or (item->>'sha256') !~ '^[a-f0-9]{64}$' then raise exception 'AM1_INVALID_RECEIPT'; end if;
      update petatoe_am1.items set original_sha256=item->>'sha256' where archive_id=aid and ordinal=it.ordinal;
    end loop;
    update petatoe_am1.archives set status='ready',ready_at=clock_timestamp(),pdf_sha256=sha,pdf_bytes=bytes_count,file_name='PETATOE_Attachments_'||a.month||'_'||aid::text||'.pdf' where id=aid;
    delete from petatoe_am1.leases where archive_id=aid;
    insert into petatoe_am1.events(archive_id,actor_id,action,details) values(aid,p_actor,'pdf_ready',jsonb_build_object('sha256',sha,'bytes',bytes_count));
    return jsonb_build_object('ready',true,'id',aid);
  elsif p_action='confirm' then
    if a.status not in ('ready','confirmed') or a.pdf_sha256 is distinct from p_input->>'sha256' or a.pdf_bytes is distinct from (p_input->>'bytes')::bigint then raise exception 'AM1_PDF_MISMATCH'; end if;
    update petatoe_am1.archives set status='confirmed',confirmed_at=coalesce(confirmed_at,clock_timestamp()) where id=aid;
    insert into petatoe_am1.events(archive_id,actor_id,action) values(aid,p_actor,'saved_pdf_verified');
    return jsonb_build_object('confirmed',true);
  elsif p_action='purge_prepare' then
    if not cfg.deletion_enabled then raise exception 'AM1_DELETION_NOT_ENABLED'; end if;
    if a.status not in ('confirmed','purging') or a.confirmed_at is null or p_input->>'confirmMonth' is distinct from a.month then raise exception 'AM1_PURGE_NOT_CONFIRMED'; end if;
    if a.status='purging' and exists(select 1 from petatoe_am1.leases where archive_id=aid and expires_at>clock_timestamp()) then
      return jsonb_build_object('prepared',true);
    end if;
    for it in select * from petatoe_am1.items where archive_id=aid and not protected and deleted_at is null order by ordinal loop
      if not petatoe_am1.bucket_supported(it.bucket_id) then raise exception 'AM1_BUCKET_MODE_UNSUPPORTED'; end if;
      select to_jsonb(x) into current_object from storage.objects x where x.id=it.object_id and x.bucket_id=it.bucket_id and x.name=it.path and x.version=it.object_version for update;
      -- A missing or overwritten object is never silently treated as an archived match.
      if current_object is null and it.delete_requested_at is not null then
        update petatoe_am1.items set deleted_at=clock_timestamp() where archive_id=aid and ordinal=it.ordinal;
        continue;
      end if;
      if current_object is null or petatoe_am1.fingerprint(current_object)<>it.fingerprint then raise exception 'AM1_OBJECT_CHANGED_REEXPORT_REQUIRED'; end if;
      -- Deletion leases do not silently expire while a Storage response is uncertain.
      -- Resume reconciles the exact path before releasing it. Export leases expire.
      insert into petatoe_am1.leases(bucket_id,path,archive_id,expires_at) values(it.bucket_id,it.path,aid,'infinity'::timestamptz)
      on conflict(bucket_id,path) do update set archive_id=excluded.archive_id,expires_at=excluded.expires_at where petatoe_am1.leases.archive_id=aid or petatoe_am1.leases.expires_at<=clock_timestamp();
      if not found then raise exception 'AM1_ARCHIVE_BUSY'; end if;
    end loop;
    update petatoe_am1.archives set status='purging' where id=aid;
    insert into petatoe_am1.events(archive_id,actor_id,action) values(aid,p_actor,'purge_requested');
    return jsonb_build_object('prepared',true);
  elsif p_action='purge_batch_begin' then
    if not cfg.deletion_enabled or a.status<>'purging' then raise exception 'AM1_PURGE_NOT_CONFIRMED'; end if;
    if a.batch_until>clock_timestamp() then raise exception 'AM1_PURGE_BUSY'; end if;
    token:=gen_random_uuid()::text;
    update petatoe_am1.archives set batch_token=token::uuid,batch_until=clock_timestamp()+interval '2 minutes' where id=aid;
    return jsonb_build_object('token',token);
  elsif p_action='purge_batch_end' then
    if a.batch_token::text is distinct from p_input->>'token' then raise exception 'AM1_PURGE_BUSY'; end if;
    update petatoe_am1.archives set batch_token=null,batch_until=null where id=aid;
    return jsonb_build_object('released',true);
  elsif p_action='purge_next' then
    if not cfg.deletion_enabled or a.status<>'purging' or a.confirmed_at is null then raise exception 'AM1_PURGE_NOT_CONFIRMED'; end if;
    if a.batch_token::text is distinct from p_input->>'token' or a.batch_until<=clock_timestamp() then raise exception 'AM1_PURGE_BUSY'; end if;
    select * into it from petatoe_am1.items where archive_id=aid and not protected and deleted_at is null order by ordinal limit 1;
    if not found then
      update petatoe_am1.archives set status='purged' where id=aid;
      delete from petatoe_am1.leases where archive_id=aid;
      return jsonb_build_object('done',true);
    end if;
    if not exists(select 1 from petatoe_am1.leases l where l.bucket_id=it.bucket_id and l.path=it.path and l.archive_id=aid and l.expires_at='infinity'::timestamptz) then raise exception 'AM1_PURGE_LEASE_EXPIRED'; end if;
    if not petatoe_am1.bucket_supported(it.bucket_id) then raise exception 'AM1_BUCKET_MODE_UNSUPPORTED'; end if;
    select to_jsonb(x) into current_object from storage.objects x where x.id=it.object_id and x.bucket_id=it.bucket_id and x.name=it.path and x.version=it.object_version for update;
    if current_object is null and it.delete_requested_at is not null then
      -- Reconcile a previous Storage remove that succeeded before the browser lost its response.
      update petatoe_am1.items set deleted_at=clock_timestamp(),last_error=null where archive_id=aid and ordinal=it.ordinal;
      return jsonb_build_object('reconciled',true);
    end if;
    if current_object is null or petatoe_am1.fingerprint(current_object)<>it.fingerprint then raise exception 'AM1_OBJECT_CHANGED_REEXPORT_REQUIRED'; end if;
    if it.delete_requested_at is not null then
      -- An earlier HTTP timeout may still be executing. Do not issue a second
      -- unconditional Storage remove for the same path, or release its lock.
      raise exception 'AM1_STORAGE_OUTCOME_UNCERTAIN';
    end if;
    update petatoe_am1.items set delete_requested_at=clock_timestamp() where archive_id=aid and ordinal=it.ordinal;
    return jsonb_build_object('done',false,'ordinal',it.ordinal,'objectId',it.object_id,'bucket',it.bucket_id,'path',it.path,'objectVersion',it.object_version);
  elsif p_action='purge_failure' then
    if a.status<>'purging' or a.batch_token::text is distinct from p_input->>'token' then raise exception 'AM1_PURGE_BUSY'; end if;
    update petatoe_am1.items set
      delete_requested_at=case when p_input->>'definiteFailure'='true' then null else delete_requested_at end,
      last_error=case when p_input->>'definiteFailure'='true' then 'STORAGE_REJECTED_REQUEST' else 'STORAGE_OUTCOME_UNCERTAIN' end
      where archive_id=aid and ordinal=(p_input->>'ordinal')::int and not protected and deleted_at is null;
    return jsonb_build_object('recorded',true);
  elsif p_action='purge_mark' then
    if not cfg.deletion_enabled or a.status<>'purging' then raise exception 'AM1_INVALID_STATE'; end if;
    if a.batch_token::text is distinct from p_input->>'token' then raise exception 'AM1_PURGE_BUSY'; end if;
    select * into it from petatoe_am1.items where archive_id=aid and ordinal=(p_input->>'ordinal')::int and not protected;
    if not found then raise exception 'AM1_ITEM_NOT_FOUND'; end if;
    if exists(select 1 from storage.objects x where x.bucket_id=it.bucket_id and x.name=it.path and x.version=it.object_version) then raise exception 'AM1_STORAGE_DELETE_NOT_PROVEN'; end if;
    update petatoe_am1.items set deleted_at=coalesce(deleted_at,clock_timestamp()),last_error=null where archive_id=aid and ordinal=it.ordinal;
    insert into petatoe_am1.events(archive_id,actor_id,action,details) values(aid,p_actor,'object_deleted',jsonb_build_object('ordinal',it.ordinal,'objectId',it.object_id));
    return jsonb_build_object('marked',true);
  end if;
  raise exception 'AM1_UNSUPPORTED_ACTION';
end $$;
revoke all on all functions in schema petatoe_am1 from public,anon,authenticated;
revoke all on function public.petatoe_attachment_admin_am1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.petatoe_attachment_admin_am1(uuid,text,jsonb) to service_role;
insert into public.app_screens(screen_key,screen_name,group_name,display_order,is_active)
values('attachmentManagement','إدارة المرفقات','الإعدادات والخصوصية',109,true);
-- Only the new screen is assigned. All pre-existing roles and permissions remain intact.
insert into public.role_screen_permissions(role,screen_key,can_view,can_add,can_edit,can_delete,can_export)
values('super_admin','attachmentManagement',true,false,false,true,true);
commit;
