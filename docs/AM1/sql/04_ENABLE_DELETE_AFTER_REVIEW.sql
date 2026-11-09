-- Separate production decision. NOT part of initial deployment.
-- Requires user review of the saved PDF, extracted originals + second backup,
-- record visibility, ACLs, guard behavior, and the actual deletion scope.
begin;
set local lock_timeout='3s';
set local statement_timeout='8s';
do $$ begin
 if not exists(select 1 from petatoe_am1.config where revision='AM1R1') then raise exception 'AM1_REVISION_MISMATCH'; end if;
 if not exists(select 1 from petatoe_am1.config where enabled=true) then raise exception 'AM1_NOT_ENABLED'; end if;
 if not exists(select 1 from petatoe_am1.archives a where confirmed_at is not null and status in ('confirmed','purging')
   and not exists(select 1 from petatoe_am1.items i where i.archive_id=a.id and (i.original_sha256 is null or i.version_bound_at is null))) then
   raise exception 'AM1_NO_VERIFIED_ARCHIVE';
 end if;
 if not exists(select 1 from pg_trigger where tgname='petatoe_am1_archive_guard' and tgrelid='storage.objects'::regclass and tgenabled='O') then raise exception 'AM1_GUARD_NOT_ENABLED'; end if;
end $$;
update petatoe_am1.config set deletion_enabled=true where id=true;
select jsonb_build_object('phase','AM1-DELETE-ENABLED','deletion_enabled',deletion_enabled,'no_images_deleted_by_this_sql',true) as am1_delete_enable_result from petatoe_am1.config;
commit;
