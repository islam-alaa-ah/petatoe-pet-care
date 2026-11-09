-- Run only AFTER precheck review, backup, disabled installation, Edge deployment
-- and new RPC/table ACL verification. Does not enable deletion.
begin;
set local lock_timeout='3s';
set local statement_timeout='8s';
do $$ begin
 if not exists(select 1 from petatoe_am1.config where revision='AM1R1') then raise exception 'AM1_REVISION_MISMATCH'; end if;
 if has_function_privilege('anon','public.petatoe_attachment_admin_am1(uuid,text,jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.petatoe_attachment_admin_am1(uuid,text,jsonb)','EXECUTE') then
   raise exception 'AM1_UNSAFE_RPC_ACL';
 end if;
 if not exists(select 1 from pg_trigger where tgname='petatoe_am1_archive_guard' and tgrelid='storage.objects'::regclass and tgenabled='O') then
   raise exception 'AM1_GUARD_NOT_ENABLED';
 end if;
end $$;
update petatoe_am1.config set enabled=true,deletion_enabled=false where id=true;
select jsonb_build_object('phase','AM1-READ-EXPORT','enabled',enabled,'deletion_enabled',deletion_enabled) as am1_enable_result from petatoe_am1.config;
commit;
