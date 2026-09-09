(function(){
  'use strict';
  const SCREEN='installationContactData';
  const TABLE='appointment_contact_daily_data';
  const client=()=>{if(!window.customerSupabase)throw new Error(window.PetatoeLocalization?.t?.('appointments.contact.error.dbNotReady')||'Database service is not ready.');return window.customerSupabase;};
  const auth=()=>window.CustomerAuth?.getState?.()||{};
  const permission=(action)=>Boolean(window.PermissionEngine?.can?.(SCREEN,action)??window.CustomerPermissions?.canScreen?.(SCREEN,action));
  const requirePermission=(action)=>{if(permission(action))return true;throw new Error(window.PetatoeLocalization?.t?.('appointments.contact.error.permission')||'You do not have permission for this action.');};
  const normalize=row=>row?Object.freeze({
    workDate:row.work_date,
    socialMedia:Number(row.social_media_count||0),
    websiteAppointments:Number(row.website_appointments_count||0),
    newCustomers:Number(row.new_customers_count||0),
    whatsapp:Number(row.whatsapp_count||0),
    calls:Number(row.call_count||0),
    inventorySales:Number(row.inventory_sales_count||0),
    appointmentsCreated:Number(row.appointments_created_count||0),
    createdBy:row.created_by||null,
    updatedBy:row.updated_by||null,
    createdAt:row.created_at||null,
    updatedAt:row.updated_at||null
  }):null;
  async function getForDate(workDate){
    requirePermission('view');
    if(navigator.onLine===false)throw new Error(window.PetatoeLocalization?.t?.('appointments.contact.error.onlineRequired')||'An internet connection is required.');
    const {data,error}=await client().from(TABLE).select('work_date,social_media_count,website_appointments_count,new_customers_count,whatsapp_count,call_count,inventory_sales_count,appointments_created_count,created_by,updated_by,created_at,updated_at').eq('work_date',workDate).maybeSingle();
    if(error)throw new Error((window.PetatoeLocalization?.t?.('appointments.contact.error.load')||'Unable to load communication data.')+` ${error.message||''}`.trim());
    return normalize(data);
  }
  async function saveForDate(workDate,values,existing=false){
    const action=existing?'edit':'add';
    requirePermission(action);
    if(navigator.onLine===false)throw new Error(window.PetatoeLocalization?.t?.('appointments.contact.error.onlineRequired')||'An internet connection is required.');
    const userId=auth()?.user?.id||null;
    if(!userId)throw new Error(window.PetatoeLocalization?.t?.('appointments.contact.error.userMissing')||'Unable to determine the current user.');
    const payload={
      work_date:workDate,
      social_media_count:values.socialMedia,
      website_appointments_count:values.websiteAppointments,
      new_customers_count:values.newCustomers,
      whatsapp_count:values.whatsapp,
      call_count:values.calls,
      inventory_sales_count:values.inventorySales,
      appointments_created_count:values.appointmentsCreated,
      updated_by:userId,
      updated_at:new Date().toISOString()
    };
    let query;
    if(existing){
      query=client().from(TABLE).update(payload).eq('work_date',workDate);
    }else{
      payload.created_by=userId;
      query=client().from(TABLE).insert(payload);
    }
    const {data,error}=await query.select('work_date,social_media_count,website_appointments_count,new_customers_count,whatsapp_count,call_count,inventory_sales_count,appointments_created_count,created_by,updated_by,created_at,updated_at').single();
    if(error){
      if(!existing && String(error.code||'')==='23505' && permission('edit')) return saveForDate(workDate,values,true);
      throw new Error((window.PetatoeLocalization?.t?.('appointments.contact.error.save')||'Unable to save communication data.')+` ${error.message||''}`.trim());
    }
    return normalize(data);
  }
  window.AppointmentContactDataService=Object.freeze({screenKey:SCREEN,getForDate,saveForDate,can:permission});
})();
