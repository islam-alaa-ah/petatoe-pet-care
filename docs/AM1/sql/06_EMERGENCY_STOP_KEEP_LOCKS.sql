-- Stops NEW AM1 operations; does not undo a Storage request already in flight.
-- Leaves protective locks and audit history intact for read-only reconciliation.
-- Do not disable the trigger or clear pending-deletion flags as an automatic fix.
begin;
set local lock_timeout='3s';
set local statement_timeout='8s';
update petatoe_am1.config set enabled=false,deletion_enabled=false where id=true;
select jsonb_build_object('phase','AM1-EMERGENCY-STOP','new_operations_disabled',true,'protective_locks_retained',true,'in_flight_storage_request_may_still_finish',true) as am1_stop_result;
commit;
