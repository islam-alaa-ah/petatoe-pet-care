begin read only;
set local statement_timeout='8s';
select jsonb_build_object('phase','AM1-ARCHIVE-VERIFY','config',(select to_jsonb(c) from petatoe_am1.config c),
 'archives',(select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]') from
 (select a.id,a.month,a.actor_id,a.status,a.created_at,a.ready_at,a.confirmed_at,a.item_count,a.pdf_sha256,a.pdf_bytes,
   (select count(*) from petatoe_am1.items i where i.archive_id=a.id and i.protected) as protected,
   (select count(*) from petatoe_am1.items i where i.archive_id=a.id and i.deleted_at is not null) as deleted,
   (select count(*) from petatoe_am1.items i where i.archive_id=a.id and i.original_sha256 is null) as missing_original_hashes,
   (select count(*) from petatoe_am1.items i where i.archive_id=a.id and i.version_bound_at is null) as missing_version_bindings
  from petatoe_am1.archives a order by created_at desc limit 30)s),
 'active_leases',(select count(*) from petatoe_am1.leases where expires_at>clock_timestamp()),
 'pending_deletions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from
   (select archive_id,ordinal,object_id,bucket_id,path,delete_requested_at,last_error
    from petatoe_am1.items where delete_requested_at is not null and deleted_at is null
    order by delete_requested_at desc limit 50)p),
 'notice','No deletion or financial RPC executed; review original-file extraction and visible PDFs separately'
) as am1_archive_verify;
commit;
