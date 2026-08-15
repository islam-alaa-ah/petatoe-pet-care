-- P5.12.7 — Appointment scheduling/live edit notification
begin;
update public.notification_event_settings set event_name='تم تعديل الطلب',target_view='installationExecution',is_enabled=true,in_app_enabled=true,updated_at=now() where event_key='installation.request_updated';
create or replace function public.emit_notification_event(p_event_key text,p_request_id uuid default null,p_visit_id uuid default null,p_metadata jsonb default '{}'::jsonb,p_occurrence_key text default null) returns integer language plpgsql security definer set search_path=public set row_security=off as $$
declare v_setting public.notification_event_settings%rowtype;v_master boolean:=true;v_request_number text:='';v_customer_name text:='';v_representative_id uuid;v_team_id uuid;v_technician_name text:='';v_user_id uuid;v_count integer:=0;v_occurrence text;v_body text;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select is_enabled into v_master from public.notification_system_settings where id=1;if coalesce(v_master,false)=false then return 0;end if;
 select * into v_setting from public.notification_event_settings where event_key=p_event_key;if not found or v_setting.is_enabled=false or v_setting.in_app_enabled=false then return 0;end if;
 if p_request_id is not null then select r.request_number,r.representative_id,r.installation_team_id,coalesce(r.assigned_technician_name,''),coalesce(c.customer_name,'') into v_request_number,v_representative_id,v_team_id,v_technician_name,v_customer_name from public.installation_requests r left join public.customers c on c.id=r.customer_id where r.id=p_request_id;end if;
 v_occurrence:=coalesce(nullif(p_occurrence_key,''),p_event_key||':'||coalesce(p_visit_id::text,p_request_id::text,'global'));
 v_body:=case when p_event_key='installation.request_updated' then 'تم التعديل على الطلب رقم '||coalesce(nullif(v_request_number,''),'—') else trim(both ' — ' from concat_ws(' — ',nullif(v_request_number,''),nullif(v_customer_name,''))) end;
 for v_user_id in select distinct recipient_id from (
  select up.id recipient_id from public.notification_event_recipient_rules rr join public.user_profiles up on up.id=rr.user_id and coalesce(up.is_active,true)=true where rr.event_key=p_event_key and rr.is_active=true and rr.recipient_type='user'
  union all select up.id from public.notification_event_recipient_rules rr join public.user_profiles up on up.role::text=rr.role_key and coalesce(up.is_active,true)=true where rr.event_key=p_event_key and rr.is_active=true and rr.recipient_type='role'
  union all select up.id from public.notification_event_recipient_rules rr join public.user_profiles up on up.representative_id=v_representative_id and coalesce(up.is_active,true)=true where rr.event_key=p_event_key and rr.is_active=true and rr.recipient_type='request_owner' and v_representative_id is not null
  union all select b.user_id from public.installation_user_technician_bindings b join public.user_profiles up on up.id=b.user_id and coalesce(up.is_active,true)=true where p_event_key='installation.request_updated' and b.installation_team_id=v_team_id and (coalesce(v_technician_name,'')='' or b.normalized_technician_name=public.normalize_installation_technician_name(v_technician_name))
 )q loop
  insert into public.notifications(user_id,event_key,request_id,visit_id,title,body,target_view,metadata,dedupe_key) values(v_user_id,p_event_key,p_request_id,p_visit_id,v_setting.event_name,v_body,v_setting.target_view,coalesce(p_metadata,'{}'::jsonb),md5(v_user_id::text||'|'||p_event_key||'|'||v_occurrence)) on conflict(dedupe_key) do nothing;if found then v_count:=v_count+1;end if;
 end loop;return v_count;
end;$$;
grant execute on function public.emit_notification_event(text,uuid,uuid,jsonb,text) to authenticated;
commit;
