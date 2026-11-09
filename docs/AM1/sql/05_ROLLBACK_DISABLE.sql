-- Reversible module shutdown. Does not remove archive history or restore deleted bytes.
-- Do not disable a guard while a Storage deletion may still be in flight.
begin;
set local lock_timeout='3s';
set local statement_timeout='8s';
do $$ begin
 if exists(select 1 from petatoe_am1.leases where expires_at='infinity'::timestamptz) then
   raise exception 'AM1_PURGE_RECONCILIATION_REQUIRED: finish/resume the pending batch before rollback';
 end if;
end $$;
update petatoe_am1.config set enabled=false,deletion_enabled=false where id=true;
update petatoe_am1.archives set status='cancelled' where status='preparing';
delete from petatoe_am1.leases where expires_at<>'infinity'::timestamptz;
select jsonb_build_object('phase','AM1-DISABLED','no_business_data_changed',true,'deleted_images_require_manual_restore_from_embedded_originals',true) as am1_rollback_result;
commit;
