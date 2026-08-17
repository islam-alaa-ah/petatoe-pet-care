(function(){
  function db(){if(!window.customerSupabase) throw new Error('اتصال Supabase غير جاهز.');return window.customerSupabase}
  function notifyEvent(eventKey,requestId,visitId,metadata,occurrenceKey){try{return window.NotificationCenterService?.emit?.(eventKey,{requestId:requestId||null,visitId:visitId||null,metadata:metadata||{},occurrenceKey:occurrenceKey||null})}catch(e){console.warn('[Notifications]',e);return null}}
  async function hasExecutionVisit(requestId){if(!requestId)return false;const {data,error}=await db().from('installation_execution_visits').select('id').eq('installation_request_id',requestId).limit(1);return !error&&Array.isArray(data)&&data.length>0}
  async function fetchPaged(factory,pageSize=500){const all=[];for(let start=0;;start+=pageSize){const {data,error}=await factory(start,start+pageSize-1);if(error)throw error;const page=data||[];all.push(...page);if(page.length<pageSize)break}return all}
  function requireAction(action,screen='installationRequests'){const p=window.CustomerPermissions;if(p?.requireAction && !p.requireAction(screen,action,{silent:true})) throw new Error('ليس لديك صلاحية لتنفيذ هذا الإجراء.');}
  function normalize(row){return {id:row.id,requestNumber:row.request_number,customerOrderNumber:row.customer_order_number||'',customerId:row.customer_id,customerName:row.customer?.customer_name||'',customerPhone:row.customer?.phone||'',quotationId:row.quotation_id,quotationNumber:row.quotation?.quotation_number||'',representativeId:row.representative_id,representativeName:row.representative?.full_name||'',teamId:row.installation_team_id||'',teamName:row.team?.name||'',scheduledDate:row.scheduled_date||'',scheduledTime:row.scheduled_time||'',timeSlot:row.time_slot||'',status:row.status||'بانتظار المراجعة',priority:row.priority||'عادية',technicianName:row.assigned_technician_name||'',assignmentNotes:row.assignment_notes||'',installationAddress:row.installation_address||'',customerMapUrl:row.customer_map_url||'',neighborhoodId:row.neighborhood_id||'',city:row.customer?.city||'',district:row.customer?.district||'',description:row.description||'',notes:row.notes||'',totalServicesCount:Number(row.total_services_count||0),totalServicesAmount:Number(row.total_services_amount||0),discountType:row.discount_type||'amount',discountValue:Number(row.discount_value??row.discount_amount??0),discountAmount:Number(row.discount_amount||0),taxRate:Number(row.tax_rate??15),taxAmount:Number(row.tax_amount||0),finalAmount:Number(row.final_amount||row.total_services_amount||0),services:row.services||[],animals:row.animals||[],collection:row.collection||null,createdAt:row.created_at||'',updatedAt:row.updated_at||''}}
  async function list(){requireAction('view');const [data,serviceRows]=await Promise.all([fetchPaged((from,to)=>db().from('installation_requests').select('*,customer:customers(id,customer_number,customer_name,phone,address),quotation:quotations!installation_requests_quotation_id_fkey(id,quotation_number),representative:sales_representatives(id,full_name),team:installation_teams(id,name)').order('created_at',{ascending:false}).range(from,to)),fetchPaged((from,to)=>db().from('installation_request_services').select('installation_request_id,quantity,unit_price,line_total,service:installation_service_types(id,name)').range(from,to),1000)]);const byRequest=new Map();serviceRows.forEach(x=>{const arr=byRequest.get(x.installation_request_id)||[];arr.push({serviceTypeId:x.service?.id||'',serviceName:x.service?.name||'',quantity:Number(x.quantity||0),unitPrice:Number(x.unit_price||0),lineTotal:Number(x.line_total||0)});byRequest.set(x.installation_request_id,arr)});return data.map(row=>normalize({...row,services:byRequest.get(row.id)||[]}))}
  async function loadInstallationCustomers(){
    const attempts=['id,customer_number,customer_name,phone,address,google_maps_url,neighborhood_id','id,customer_number,customer_name,phone,address,google_maps_url','id,customer_number,customer_name,phone,address'];
    let lastError=null;
    for(const select of attempts){
      try{const rows=await fetchPaged((from,to)=>db().from('customers').select(select).order('customer_name').range(from,to));return rows.map(row=>({...row,google_maps_url:row.google_maps_url||'',neighborhood_id:row.neighborhood_id||''}));}
      catch(error){lastError=error;const message=String(error?.message||'').toLowerCase();if(!(message.includes('column')||message.includes('schema cache')||message.includes('does not exist')))throw error;}
    }
    throw lastError||new Error('تعذر تحميل بيانات العملاء.');
  }

  async function saveCustomerLocationDefaults(customerId,neighborhoodId,googleMapsUrl=''){
    if(!customerId||!neighborhoodId)return false;
    const {error}=await db().rpc('save_customer_appointment_location_defaults',{
      p_customer_id:customerId,
      p_neighborhood_id:neighborhoodId,
      p_google_maps_url:String(googleMapsUrl||'').trim()||null
    });
    if(error)throw new Error('تعذر حفظ حي العميل: '+error.message);
    return true;
  }

  async function customerAppointmentDefaults(customerId){
    if(!customerId)return null;
    const {data,error}=await db().rpc('get_customer_appointment_defaults',{p_customer_id:customerId});
    if(error)throw new Error('تعذر تحميل آخر بيانات العميل: '+error.message);
    const x=data||{};
    return {neighborhoodId:x.neighborhood_id||'',neighborhoodName:x.neighborhood_name||'',customerMapUrl:x.google_maps_url||'',address:x.address||'',quotationId:x.quotation_id||'',notes:x.notes||'',discountType:x.discount_type||'amount',discountValue:Number(x.discount_value??x.discount_amount??0),services:(x.services||[]).map(a=>({serviceTypeId:a.service_type_id||'',serviceName:a.service_name||'',quantity:Number(a.quantity||1),unitPrice:Number(a.unit_price||0)})),animals:(x.animals||[]).map(a=>({petName:a.pet_name||'',petType:a.pet_type||'',breed:a.breed||'',petSize:a.pet_size||'',quantity:Number(a.quantity||1)})),collection:x.collection&&Object.keys(x.collection).length?{amountCollected:Number(x.collection.amount_collected||0),collectionStatus:x.collection.collection_status||'غير محصل',paymentMethod:x.collection.payment_method||'',appointmentStatus:x.collection.appointment_status||'بانتظار المراجعة'}:null};
  }
  async function options(){
    const tasks={
      customers:loadInstallationCustomers(),
      quotations:fetchPaged((from,to)=>db().from('quotations').select('id,quotation_number,customer_order_number,customer_id,status,amount,installation_request_id').eq('status','مقبول').order('quotation_date',{ascending:false}).range(from,to)),
      regions:fetchPaged((from,to)=>db().from('installation_regions').select('id,name,is_active').eq('is_active',true).order('name').range(from,to)),
      cities:fetchPaged((from,to)=>db().from('installation_cities').select('id,region_id,name,is_active').eq('is_active',true).order('name').range(from,to)),
      neighborhoods:fetchPaged((from,to)=>db().from('installation_neighborhoods').select('id,region_id,city_id,name,city,region,is_active').eq('is_active',true).order('name').range(from,to)),
      serviceTypes:fetchPaged((from,to)=>db().from('installation_service_types').select('id,name,default_price').eq('is_active',true).order('name').range(from,to)),
      breeds:fetchPaged((from,to)=>db().from('appointment_pet_breeds').select('id,pet_type,name,is_active').eq('is_active',true).order('pet_type').order('name').range(from,to))
    };
    const keys=Object.keys(tasks);
    const settled=await Promise.allSettled(keys.map(key=>tasks[key]));
    const result={customers:[],quotations:[],regions:[],cities:[],neighborhoods:[],serviceTypes:[],breeds:[],errors:{}};
    settled.forEach((entry,index)=>{
      const key=keys[index];
      if(entry.status==='fulfilled') result[key]=entry.value;
      else result.errors[key]=entry.reason?.message||String(entry.reason||'تعذر تحميل البيانات.');
    });
    return result;
  }
  async function validateNeighborhoodIntegrity(neighborhoodId){
    if(!neighborhoodId)throw new Error('اختر الحي الخاص بالموعد.');
    const {data:neighborhood,error}=await db().from('installation_neighborhoods').select('id,name,is_active').eq('id',neighborhoodId).eq('is_active',true).maybeSingle();
    if(error||!neighborhood)throw new Error('الحي المختار غير موجود أو غير نشط.');
    return {neighborhood};
  }
  function normalizeGoogleMapsUrl(value){const url=String(value||'').trim();if(!url)return '';let parsed;try{parsed=new URL(url)}catch(_){throw new Error('رابط موقع العميل غير صحيح. استخدم رابط مشاركة من Google Maps.')}const host=parsed.hostname.toLowerCase();const valid=(host==='maps.app.goo.gl'||host==='maps.google.com'||host==='www.google.com'||host==='google.com'||host==='goo.gl')&&(host!=='goo.gl'||parsed.pathname.toLowerCase().startsWith('/maps'));if(parsed.protocol!=='https:'||!valid)throw new Error('استخدم رابط Google Maps آمن يبدأ بـ https.');return parsed.toString()}
  async function createRequest(payload){
    requireAction('add','installationRequestNew');
    if(!payload.customerId)throw new Error('اختر العميل.');
    if(payload.quotationId){
      const {data:contract,error:contractError}=await db().from('quotations').select('id,customer_id,status,installation_request_id').eq('id',payload.quotationId).maybeSingle();
      if(contractError)throw new Error('تعذر التحقق من العقد: '+contractError.message);
      if(!contract||String(contract.customer_id)!==String(payload.customerId))throw new Error('العقد لا يخص العميل المحدد.');
      if(contract.status!=='مقبول')throw new Error('لا يمكن إنشاء موعد إلا من عقد مقبول.');
      if(contract.installation_request_id)throw new Error('تم إنشاء موعد لهذا العقد بالفعل.');
    }
    const geo=await validateNeighborhoodIntegrity(payload.neighborhoodId);
    if(!Array.isArray(payload.services)||!payload.services.length)throw new Error('أضف خدمة واحدة على الأقل.');
    const services=payload.services.map(x=>({service_type_id:x.serviceTypeId,quantity:Number(x.quantity),unit_price:Number(x.unitPrice)}));
    if(services.some(x=>!x.service_type_id||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unit_price)||x.unit_price<0))throw new Error('راجع نوع الخدمة والعدد والسعر في جميع الخدمات.');
    const animals=(payload.animals||[]).map(x=>({pet_name:x.petName||'',pet_type:x.petType||'',breed:x.breed||'',pet_size:x.petSize||'',quantity:Number(x.quantity||1)}));
    const collection={amount_collected:Number(payload.collection?.amountCollected||0),collection_status:payload.collection?.collectionStatus||'غير محصل',payment_method:payload.collection?.paymentMethod||'',appointment_status:payload.collection?.appointmentStatus||'بانتظار المراجعة'};
    const {data,error}=await db().rpc('create_petatoe_appointment',{p_customer_id:payload.customerId,p_contract_id:payload.quotationId||null,p_representative_id:payload.representativeId||null,p_neighborhood_id:geo.neighborhood.id,p_customer_map_url:normalizeGoogleMapsUrl(payload.customerMapUrl)||null,p_notes:payload.notes||null,p_services:services,p_discount_amount:Number(payload.discountAmount||0),p_discount_type:payload.discountType||'amount',p_discount_value:Number(payload.discountValue??payload.discountAmount??0),p_animals:animals,p_collection:collection});
    if(error)throw new Error('تعذر إنشاء الموعد: '+error.message);
    const {error:customerDefaultsError}=await db().rpc('save_customer_appointment_location_defaults',{p_customer_id:payload.customerId,p_neighborhood_id:geo.neighborhood.id,p_google_maps_url:normalizeGoogleMapsUrl(payload.customerMapUrl)||null});
    if(customerDefaultsError)console.warn('[Appointments] Customer location defaults were not persisted:',customerDefaultsError.message);
    const created=Array.isArray(data)?data[0]:data;void notifyEvent('installation.request_created',created?.id||null,null,{source:'create_appointment'},created?.id||null);return created;
  }

  async function updateRequest(payload){
    requireAction('edit','installationRequests');
    if(!payload.id)throw new Error('معرّف الموعد مطلوب.');
    if(!payload.customerId)throw new Error('اختر العميل.');
    const geo=await validateNeighborhoodIntegrity(payload.neighborhoodId);
    if(!Array.isArray(payload.services)||!payload.services.length)throw new Error('أضف خدمة واحدة على الأقل.');
    const services=payload.services.map(x=>({service_type_id:x.serviceTypeId,quantity:Number(x.quantity),unit_price:Number(x.unitPrice)}));
    if(services.some(x=>!x.service_type_id||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unit_price)||x.unit_price<0))throw new Error('راجع نوع الخدمة والعدد والسعر في جميع الخدمات.');
    const animals=(payload.animals||[]).map(x=>({pet_name:x.petName||'',pet_type:x.petType||'',breed:x.breed||'',pet_size:x.petSize||'',quantity:Number(x.quantity||1)}));
    const collection={amount_collected:Number(payload.collection?.amountCollected||0),collection_status:payload.collection?.collectionStatus||'غير محصل',payment_method:payload.collection?.paymentMethod||'',appointment_status:payload.collection?.appointmentStatus||'بانتظار المراجعة'};
    const {data,error}=await db().rpc('update_petatoe_appointment',{p_request_id:payload.id,p_customer_id:payload.customerId,p_contract_id:payload.quotationId||null,p_representative_id:payload.representativeId||null,p_neighborhood_id:geo.neighborhood.id,p_customer_map_url:normalizeGoogleMapsUrl(payload.customerMapUrl)||null,p_notes:payload.notes||null,p_services:services,p_discount_amount:Number(payload.discountAmount||0),p_discount_type:payload.discountType||'amount',p_discount_value:Number(payload.discountValue??payload.discountAmount??0),p_animals:animals,p_collection:collection});
    if(error)throw new Error('تعذر حفظ تعديلات الموعد: '+error.message);
    const {error:customerDefaultsError}=await db().rpc('save_customer_appointment_location_defaults',{p_customer_id:payload.customerId,p_neighborhood_id:geo.neighborhood.id,p_google_maps_url:normalizeGoogleMapsUrl(payload.customerMapUrl)||null});
    if(customerDefaultsError)console.warn('[Appointments] Customer location defaults were not persisted:',customerDefaultsError.message);
    const updated=Array.isArray(data)?data[0]:data;
    const requestNumber=updated?.request_number||payload.requestNumber||'';
    void notifyEvent('installation.request_updated',payload.id,null,{source:'appointment_edit',requestNumber},'updated:'+new Date().toISOString());
    return updated;
  }

  async function updateRequestServices(requestId,services){
    const canRequests=window.CustomerPermissions?.canScreen?.('installationRequests','edit')===true;
    const canSchedule=window.CustomerPermissions?.canScreen?.('installationSchedule','edit')===true;
    if(!canRequests&&!canSchedule)throw new Error('ليس لديك صلاحية تعديل خدمات المواعيد.');
    if(!requestId)throw new Error('معرّف الموعد مطلوب.');
    if(!Array.isArray(services)||!services.length)throw new Error('أضف خدمة واحدة على الأقل.');
    const normalized=services.map(x=>({service_type_id:x.serviceTypeId,quantity:Number(x.quantity),unit_price:Number(x.unitPrice)}));
    if(normalized.some(x=>!x.service_type_id||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unit_price)||x.unit_price<0))throw new Error('راجع نوع الخدمة والعدد والسعر في جميع الخدمات.');
    const {data:row,error:loadError}=await db().from('installation_requests').select('id,customer_id,quotation_id,representative_id,neighborhood_id,priority,installation_address,customer_order_number,customer_map_url,notes').eq('id',requestId).single();
    if(loadError||!row)throw new Error('تعذر تحميل بيانات الموعد قبل حفظ الخدمات: '+(loadError?.message||'الطلب غير موجود.'));
    const {data,error}=await db().rpc('update_installation_request_with_services',{
      p_request_id:row.id,p_customer_id:row.customer_id,p_quotation_id:row.quotation_id||null,p_representative_id:row.representative_id||null,p_neighborhood_id:row.neighborhood_id,p_priority:row.priority||'عادية',p_installation_address:row.installation_address||null,p_customer_order_number:row.customer_order_number||null,p_customer_map_url:row.customer_map_url||null,p_notes:row.notes||null,p_services:normalized
    });
    if(error)throw new Error('تعذر حفظ خدمات الموعد: '+error.message);
    return Array.isArray(data)?data[0]:data;
  }


  async function requestEditDetail(requestId){
    const canRequests=window.CustomerPermissions?.canScreen?.('installationRequests','view')===true;
    const canSchedule=window.CustomerPermissions?.canScreen?.('installationSchedule','view')===true;
    if(!canRequests&&!canSchedule)throw new Error('ليس لديك صلاحية عرض المواعيد.');
    if(!requestId)throw new Error('معرّف الموعد مطلوب.');
    const [{data:row,error:rowError},{data:serviceRows,error:serviceError},{data:animalRows,error:animalError},{data:collection,error:collectionError}]=await Promise.all([
      db().from('installation_requests').select('*,customer:customers(id,customer_number,customer_name,phone,address),quotation:quotations!installation_requests_quotation_id_fkey(id,quotation_number),representative:sales_representatives(id,full_name)').eq('id',requestId).single(),
      db().from('installation_request_services').select('id,service_type_id,quantity,unit_price,line_total,service:installation_service_types(id,name)').eq('installation_request_id',requestId).order('created_at',{ascending:true}),
      db().from('installation_request_animals').select('id,pet_name,pet_type,breed,pet_size,quantity,display_order').eq('installation_request_id',requestId).order('display_order'),
      db().from('installation_request_collection').select('*').eq('installation_request_id',requestId).maybeSingle()
    ]);
    if(rowError||!row)throw new Error('تعذر تحميل بيانات الموعد: '+(rowError?.message||'الموعد غير موجود.'));
    if(serviceError)throw new Error('تعذر تحميل خدمات الموعد: '+serviceError.message);
    if(animalError)throw new Error('تعذر تحميل بيانات الحيوان: '+animalError.message);
    if(collectionError)throw new Error('تعذر تحميل بيانات التحصيل: '+collectionError.message);
    return normalize({...row,services:(serviceRows||[]).map(x=>({id:x.id,serviceTypeId:x.service_type_id||x.service?.id||'',serviceName:x.service?.name||'',name:x.service?.name||'',quantity:Number(x.quantity||0),unitPrice:Number(x.unit_price||0),lineTotal:Number(x.line_total||0)})),animals:(animalRows||[]).map(x=>({id:x.id,petName:x.pet_name||'',petType:x.pet_type||'',breed:x.breed||'',petSize:x.pet_size||'',quantity:Number(x.quantity||1)})),collection:collection?{amountCollected:Number(collection.amount_collected||0),collectionStatus:collection.collection_status||'غير محصل',paymentMethod:collection.payment_method||'',appointmentStatus:collection.appointment_status||row.status||'بانتظار المراجعة',reference:collection.collection_reference||'',invoiceNumber:collection.invoice_number||'',notes:collection.collection_notes||'',collectedAt:collection.collected_at||''}:null});
  }

  async function requestEditOptions(customerId){
    const tasks=[
      fetchPaged((from,to)=>db().from('installation_regions').select('id,name,is_active').eq('is_active',true).order('name').range(from,to)),
      fetchPaged((from,to)=>db().from('installation_cities').select('id,region_id,name,is_active').eq('is_active',true).order('name').range(from,to)),
      fetchPaged((from,to)=>db().from('installation_neighborhoods').select('id,region_id,city_id,name,city,region,is_active').eq('is_active',true).order('name').range(from,to)),
      fetchPaged((from,to)=>db().from('installation_service_types').select('id,name,default_price').eq('is_active',true).order('name').range(from,to)),
      customerId?fetchPaged((from,to)=>db().from('quotations').select('id,quotation_number,customer_order_number,customer_id,status,amount,installation_request_id').eq('customer_id',customerId).eq('status','مقبول').order('quotation_date',{ascending:false}).range(from,to)):Promise.resolve([])
    ];
    const [regions,cities,neighborhoods,serviceTypes,quotations]=await Promise.all(tasks);
    return {regions,cities,neighborhoods,serviceTypes,quotations};
  }

  async function updateRequestContextServices(requestId,payload={}){
    const canRequests=window.CustomerPermissions?.canScreen?.('installationRequests','edit')===true;
    const canSchedule=window.CustomerPermissions?.canScreen?.('installationSchedule','edit')===true;
    if(!canRequests&&!canSchedule)throw new Error('ليس لديك صلاحية تعديل المواعيد.');
    if(!requestId)throw new Error('معرّف الموعد مطلوب.');
    if(!payload.neighborhoodId)throw new Error('اختر الحي الخاص بالموعد.');
    const geo=await validateNeighborhoodIntegrity(payload.neighborhoodId);
    if(!Array.isArray(payload.services)||!payload.services.length)throw new Error('أضف خدمة واحدة على الأقل.');
    const normalized=payload.services.map(x=>({service_type_id:x.serviceTypeId,quantity:Number(x.quantity),unit_price:Number(x.unitPrice)}));
    if(normalized.some(x=>!x.service_type_id||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unit_price)||x.unit_price<0))throw new Error('راجع نوع الخدمة والعدد والسعر في جميع الخدمات.');
    const {data:row,error:loadError}=await db().from('installation_requests').select('id,customer_id,quotation_id,representative_id,priority,installation_address,notes').eq('id',requestId).single();
    if(loadError||!row)throw new Error('تعذر تحميل بيانات الموعد قبل الحفظ: '+(loadError?.message||'الطلب غير موجود.'));
    const quotationId=payload.quotationId||null;
    if(quotationId){
      const {data:quotation,error:quotationError}=await db().from('quotations').select('id,customer_id,status,installation_request_id').eq('id',quotationId).maybeSingle();
      if(quotationError)throw new Error('تعذر التحقق من العقد: '+quotationError.message);
      if(!quotation||String(quotation.customer_id)!==String(row.customer_id))throw new Error('العقد لا يخص عميل الموعد.');
      if(quotation.status!=='مقبول')throw new Error('لا يمكن ربط الموعد إلا بعقد مقبول.');
      if(quotation.installation_request_id&&String(quotation.installation_request_id)!==String(requestId))throw new Error('العقد مرتبط بموعد آخر بالفعل.');
    }
    const {data,error}=await db().rpc('update_installation_request_with_services',{
      p_request_id:row.id,p_customer_id:row.customer_id,p_quotation_id:quotationId,p_representative_id:row.representative_id||null,p_neighborhood_id:geo.neighborhood.id,p_priority:row.priority||'عادية',p_installation_address:geo.neighborhood.name||row.installation_address||null,p_customer_order_number:String(payload.customerOrderNumber||'').trim()||null,p_customer_map_url:normalizeGoogleMapsUrl(payload.customerMapUrl)||null,p_notes:row.notes||null,p_services:normalized
    });
    if(error)throw new Error('تعذر حفظ بيانات وخدمات الموعد: '+error.message);
    return Array.isArray(data)?data[0]:data;
  }

  async function save(payload){requireAction(payload.id?'edit':'add',payload.id?'installationRequests':'installationRequestNew');if(!payload.id)return createRequest(payload);const record={customer_id:payload.customerId,quotation_id:payload.quotationId||null,representative_id:payload.representativeId||null,scheduled_date:payload.scheduledDate||null,time_slot:payload.timeSlot||null,status:payload.status,priority:payload.priority,installation_address:payload.installationAddress||null,customer_map_url:normalizeGoogleMapsUrl(payload.customerMapUrl)||null,description:payload.description||null,notes:payload.notes||null};const {data,error}=await db().from('installation_requests').update(record).eq('id',payload.id).select('id').single();if(error)throw new Error('تعذر حفظ الموعد: '+error.message);return data}
  async function remove(id){requireAction('delete');const {error}=await db().from('installation_requests').delete().eq('id',id);if(error)throw new Error('تعذر حذف الموعد: '+error.message)}
  async function technicians(){requireAction('view','installationSchedule');const {data,error}=await db().from('installation_technicians').select('*').order('full_name');if(error)throw new Error('تعذر تحميل الفنيين: '+error.message);return (data||[]).map(r=>({id:r.id,name:r.full_name,phone:r.phone||'',specialty:r.specialty||'',city:r.city||'',status:r.status||'متاح'}))}
  async function scheduleTeams(){requireAction('view','installationSchedule');const {data,error}=await db().from('installation_teams').select('id,name,status,groomer_name,driver_name,car_name').neq('status','غير نشطة').order('name');if(error)throw new Error('تعذر تحميل فرق المواعيد: '+error.message);return (data||[]).map(x=>({...x,groomerName:x.groomer_name||'',driverName:x.driver_name||'',carName:x.car_name||''}))}
  async function technicianNameSuggestions(){requireAction('view','installationSchedule');const {data,error}=await db().from('installation_technician_name_suggestions').select('name').eq('is_active',true).order('name');if(error)throw new Error('تعذر تحميل أسماء الفنيين المقترحة: '+error.message);return (data||[]).map(r=>r.name).filter(Boolean)}
  async function scheduleContextSnapshot(requestIds=[]){
    const ids=[...new Set((requestIds||[]).filter(Boolean))];
    if(!ids.length)return new Map();
    const {data:requestRows,error:requestError}=await db().from('installation_requests').select('id,neighborhood_id,customer_map_url,customer_order_number,quotation_id,notes,total_services_amount,tax_amount,discount_amount,final_amount').in('id',ids);
    if(requestError)throw new Error('تعذر تحميل أحدث بيانات طلبات الجدولة: '+requestError.message);
    const neighborhoodIds=[...new Set((requestRows||[]).map(x=>x.neighborhood_id).filter(Boolean))];
    const quotationIds=[...new Set((requestRows||[]).map(x=>x.quotation_id).filter(Boolean))];
    const [neighborhoodResult,quotationResult]=await Promise.all([
      neighborhoodIds.length?db().from('installation_neighborhoods').select('id,name').in('id',neighborhoodIds):Promise.resolve({data:[],error:null}),
      quotationIds.length?db().from('quotations').select('id,quotation_number').in('id',quotationIds):Promise.resolve({data:[],error:null})
    ]);
    if(neighborhoodResult.error)throw new Error('تعذر تحميل الأحياء الحالية لطلبات الجدولة: '+neighborhoodResult.error.message);
    if(quotationResult.error)throw new Error('تعذر تحميل عروض السعر الحالية لطلبات الجدولة: '+quotationResult.error.message);
    const neighborhoods=new Map((neighborhoodResult.data||[]).map(x=>[String(x.id),x.name||'']));
    const quotations=new Map((quotationResult.data||[]).map(x=>[String(x.id),x.quotation_number||'']));
    return new Map((requestRows||[]).map(x=>[String(x.id),{
      neighborhoodId:x.neighborhood_id||'',
      neighborhoodName:neighborhoods.get(String(x.neighborhood_id||''))||'',
      customerMapUrl:x.customer_map_url||'',
      customerOrderNumber:x.customer_order_number||'',
      quotationId:x.quotation_id||'',
      quotationNumber:quotations.get(String(x.quotation_id||''))||'',notes:x.notes||'',
      totalServicesAmount:Number(x.total_services_amount||0),taxAmount:Number(x.tax_amount||0),discountAmount:Number(x.discount_amount||0),finalAmount:Number(x.final_amount||0)
    }]));
  }

  async function scheduleList(){
    requireAction('view','installationSchedule');
    const [{data,error},{data:visits,error:visitError},{data:visitLines,error:lineError}]=await Promise.all([
      db().rpc('get_installation_schedule_global'),
      db().from('installation_execution_visits').select('id,installation_request_id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status,team:installation_teams(id,name)').in('status',['بانتظار الجدولة','مجدولة','قيد التنفيذ','بانتظار التأكيد']).order('visit_no'),
      db().from('installation_execution_visit_services').select('visit_id,request_service_id,scheduled_quantity')
    ]);
    if(error)throw new Error('تعذر تحميل الرؤية العامة لجدول المواعيد: '+error.message);
    if(visitError&&visitError.code!=='42P01')throw new Error('تعذر تحميل زيارات المواعيد: '+visitError.message);
    if(lineError&&lineError.code!=='42P01')throw new Error('تعذر تحميل كميات زيارات المواعيد: '+lineError.message);
    const rawRows=Array.isArray(data)?data:[];
    const contextMap=await scheduleContextSnapshot(rawRows.map(r=>r.id));
    const base=rawRows.map(r=>{
      const context=contextMap.get(String(r.id))||{};
      return {
      id:r.id,scheduleEntryId:r.id,visitId:'',visitNo:0,requestNumber:r.request_number,customerOrderNumber:context.customerOrderNumber??r.customer_order_number??'',customerName:r.customer_name||'',customerPhone:r.customer_phone||'',customerMasked:r.customer_masked===true,representativeId:r.representative_id||'',representativeName:r.representative_name||'',scheduledDate:r.scheduled_date||'',scheduledTime:r.scheduled_time||'',timeSlot:r.time_slot||'',status:r.status||'جديد',priority:r.priority||'عادية',technicianId:r.technician_id||'',technicianName:r.technician_name||'',technicianStatus:r.technician_status||'',teamId:r.team_id||'',teamName:r.team_name||'',installationAddress:context.neighborhoodName||r.installation_address||'',neighborhoodId:context.neighborhoodId||'',neighborhoodName:context.neighborhoodName||'',customerMapUrl:context.customerMapUrl||'',quotationId:context.quotationId||'',quotationNumber:context.quotationNumber||'',totalServicesCount:Number(r.total_services_count||0),totalServicesAmount:Number(r.total_services_amount||0),taxAmount:Number(context.taxAmount||0),discountAmount:Number(context.discountAmount||0),finalAmount:Number(context.finalAmount||0),grossServicesAmount:Number(context.totalServicesAmount||r.total_services_amount||0)+Number(context.taxAmount||0),services:(Array.isArray(r.services)?r.services:[]).map(x=>({id:x.id||'',name:x.name||'خدمة',quantity:Number(x.quantity||0),unitPrice:Number(x.unit_price||0),lineTotal:Number(x.line_total||0)})),requestNotes:context.notes||'',assignmentNotes:r.assignment_notes||'',canOperate:r.can_operate===true
      };
    });
    if(visitError||lineError||!(visits||[]).length)return base;
    const byRequest=new Map(base.map(x=>[x.id,x])),lineMap=new Map();
    (visitLines||[]).forEach(x=>{const arr=lineMap.get(x.visit_id)||[];arr.push(x);lineMap.set(x.visit_id,arr)});
    const visitRequestIds=new Set((visits||[]).map(v=>v.installation_request_id));
    const expanded=[];
    for(const row of base){
      if(!visitRequestIds.has(row.id)){expanded.push(row);continue;}
      const own=(visits||[]).filter(v=>v.installation_request_id===row.id);
      own.forEach(v=>{
        const allocations=new Map((lineMap.get(v.id)||[]).map(x=>[x.request_service_id,Number(x.scheduled_quantity||0)]));
        const services=row.services.map(x=>{const q=allocations.has(x.id)?allocations.get(x.id):0;return {...x,quantity:q,lineTotal:q*Number(x.unitPrice||0)}}).filter(x=>x.quantity>0);
        expanded.push({...row,scheduleEntryId:v.id,visitId:v.id,visitNo:Number(v.visit_no||0),executionNumber:`${row.requestNumber}-${String(Number(v.visit_no||0)).padStart(2,'0')}`,scheduledDate:v.scheduled_date||'',scheduledTime:String(v.scheduled_time||'').slice(0,5),teamId:v.installation_team_id||row.teamId,teamName:v.team?.name||row.teamName,technicianName:v.technician_name||row.technicianName,status:v.status||row.status,services,totalServicesCount:services.reduce((a,x)=>a+Number(x.quantity||0),0),totalServicesAmount:services.reduce((a,x)=>a+Number(x.lineTotal||0),0)});
      });
    }
    return expanded;
  }

  async function schedulePlan(requestId){
    requireAction('view','installationSchedule');
    const [{data:visits,error},{data:requestServices,error:serviceError},{data:confirmedVisits,error:confirmedVisitError}]=await Promise.all([
      db().from('installation_execution_visits').select('id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status').eq('installation_request_id',requestId).in('status',['بانتظار الجدولة','مجدولة','قيد التنفيذ','بانتظار التأكيد']).order('visit_no'),
      db().from('installation_request_services').select('id,quantity,unit_price,line_total,service:installation_service_types(id,name)').eq('installation_request_id',requestId).order('id'),
      db().from('installation_execution_visits').select('id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status,completed_at').eq('installation_request_id',requestId).eq('status','مؤكدة').order('visit_no')
    ]);
    if(error&&error.code!=='42P01')throw new Error('تعذر تحميل خطة الزيارات: '+error.message);
    if(serviceError)throw new Error('تعذر تحميل خدمات الطلب: '+serviceError.message);
    if(confirmedVisitError&&confirmedVisitError.code!=='42P01')throw new Error('تعذر تحميل سجل التنفيذ المؤكد: '+confirmedVisitError.message);
    const ids=(visits||[]).map(x=>x.id),confirmedIds=(confirmedVisits||[]).map(x=>x.id);let lines=[],confirmedLines=[];
    if(ids.length){const result=await db().from('installation_execution_visit_services').select('visit_id,request_service_id,scheduled_quantity').in('visit_id',ids);if(result.error&&result.error.code!=='42P01')throw new Error('تعذر تحميل توزيع كميات الزيارات: '+result.error.message);lines=result.data||[];}
    if(confirmedIds.length){const result=await db().from('installation_execution_visit_services').select('visit_id,request_service_id,scheduled_quantity,executed_quantity').in('visit_id',confirmedIds);if(result.error&&result.error.code!=='42P01')throw new Error('تعذر تحميل الكميات المنفذة المؤكدة: '+result.error.message);confirmedLines=result.data||[];}
    const executedByService=new Map();
    confirmedLines.forEach(x=>executedByService.set(String(x.request_service_id),Number(executedByService.get(String(x.request_service_id))||0)+Number(x.executed_quantity||0)));
    const hasConfirmed=confirmedIds.length>0;
    return {
      hasConfirmedExecution:hasConfirmed,
      services:(requestServices||[]).map(x=>{const original=Number(x.quantity||0),executed=Number(executedByService.get(String(x.id))||0),remaining=hasConfirmed?Math.max(original-executed,0):original;return {id:x.id,name:x.service?.name||'خدمة',quantity:remaining,originalQuantity:original,confirmedExecutedQuantity:executed,unitPrice:Number(x.unit_price||0),lineTotal:remaining*Number(x.unit_price||0)}}).filter(x=>x.quantity>0),
      confirmedVisits:(confirmedVisits||[]).map(v=>({...v,scheduled_time:String(v.scheduled_time||'').slice(0,5),locked:true,lines:confirmedLines.filter(x=>x.visit_id===v.id).map(x=>({requestServiceId:x.request_service_id,quantity:Number(x.executed_quantity||0),scheduledQuantity:Number(x.scheduled_quantity||0)}))})),
      visits:(visits||[]).map(v=>({...v,scheduled_time:String(v.scheduled_time||'').slice(0,5),lines:lines.filter(x=>x.visit_id===v.id).map(x=>({requestServiceId:x.request_service_id,quantity:Number(x.scheduled_quantity||0)}))}))
    };
  }

  async function assignMultiDay(payload){
    requireAction('edit','installationSchedule');
    if(!payload.id||!Array.isArray(payload.visits)||payload.visits.length<1)throw new Error('أضف موعدًا جديدًا واحدًا على الأقل.');
    const existed=await hasExecutionVisit(payload.id);
    const visits=payload.visits.map(v=>({scheduled_date:v.scheduledDate,scheduled_time:v.scheduledTime,team_id:v.teamId,technician_name:String(v.technicianName||'').trim(),services:(v.services||[]).map(x=>({request_service_id:x.requestServiceId,quantity:Number(x.quantity||0)}))}));
    for(const v of visits){if(!v.scheduled_date||!v.scheduled_time||!v.team_id||!v.technician_name)throw new Error('أكمل التاريخ والوقت والفرقة والجرومر لكل يوم.');if(!['12:00','14:00','16:00','18:00','20:00','22:00'].includes(String(v.scheduled_time).slice(0,5)))throw new Error('كل زيارة يجب أن تستخدم أحد مواعيد PETATOE الثابتة.');}
    const {data,error}=await db().rpc('schedule_installation_request_multi_day',{p_request_id:payload.id,p_visits:visits,p_assignment_notes:payload.assignmentNotes||null});
    if(error)throw new Error('تعذر حفظ الجدولة متعددة الأيام: '+error.message);
    void notifyEvent(existed?'installation.rescheduled':'installation.scheduled',payload.id,null,{multiDay:true,visits:visits.length},visits.map(v=>v.scheduled_date+'@'+v.scheduled_time).join('|'));
    return data;
  }

  async function scheduleDayLocks(dateFrom,dateTo){requireAction('view','installationSchedule');const {data,error}=await db().rpc('get_installation_schedule_day_locks',{p_date_from:dateFrom,p_date_to:dateTo});if(error)throw new Error('تعذر تحميل حالة أيام الجدولة: '+error.message);return (data||[]).map(r=>({date:r.schedule_date,isLocked:r.is_locked===true,lockedBy:r.locked_by_name||'',lockedAt:r.locked_at||''}))}
  async function setScheduleDayLock(scheduleDate,isLocked){requireAction('edit','installationSchedule');const {data,error}=await db().rpc('set_installation_schedule_day_lock',{p_schedule_date:scheduleDate,p_is_locked:!!isLocked});if(error)throw new Error('تعذر تحديث حالة يوم الجدولة: '+error.message);return data}
  async function technicianBookedTimes(scheduleDate,technicianName,excludeRequestId,teamId){requireAction('view','installationSchedule');if(!scheduleDate)return [];const tech=String(technicianName||'').trim(),team=String(teamId||'').trim();const calls=[];if(tech)calls.push(db().rpc('get_installation_technician_booked_times',{p_schedule_date:scheduleDate,p_technician_name:tech,p_exclude_request_id:excludeRequestId||null}));if(team)calls.push(db().rpc('get_installation_team_booked_times',{p_schedule_date:scheduleDate,p_team_id:team,p_exclude_request_id:excludeRequestId||null}));if(!calls.length)return [];const results=await Promise.all(calls);const merged=new Map();for(const result of results){if(result.error)throw new Error('تعذر تحميل المواعيد المحجوزة للفرقة/الجرومر: '+result.error.message);for(const r of (result.data||[])){const time=String(r.scheduled_time||'').slice(0,5);if(time&&!merged.has(time))merged.set(time,{time,requestNumber:r.request_number||''});}}return [...merged.values()]}
  async function cancelSchedule(requestId){requireAction('edit','installationSchedule');if(!requestId)throw new Error('معرّف الموعد مطلوب.');const {data,error}=await db().rpc('cancel_installation_request_schedule',{p_request_id:requestId});if(error)throw new Error('تعذر إلغاء جدولة الموعد: '+error.message);void notifyEvent('installation.schedule_cancelled',requestId,null,{source:'schedule_cancel'},'cancel:'+new Date().toISOString().slice(0,16));return data}
  async function assign(payload){requireAction('edit','installationSchedule');const existed=await hasExecutionVisit(payload.id);const technicianName=String(payload.technicianName||'').trim();if(!payload.scheduledDate)throw new Error('تاريخ الموعد مطلوب.');if(!payload.scheduledTime)throw new Error('وقت الموعد مطلوب.');if(!['12:00','14:00','16:00','18:00','20:00','22:00'].includes(String(payload.scheduledTime).slice(0,5)))throw new Error('وقت الموعد يجب أن يكون أحد المواعيد الثابتة: 12 ظهرًا، 2، 4، 6، 8 أو 10 مساءً.');if(!technicianName)throw new Error('اسم الفني مطلوب.');const normalizedName=technicianName.toLocaleLowerCase('ar').replace(/\s+/g,' ').trim();const {error:suggestionError}=await db().from('installation_technician_name_suggestions').upsert({name:technicianName,normalized_name:normalizedName,is_active:true},{onConflict:'normalized_name'});if(suggestionError)throw new Error('تعذر حفظ اسم الفني في قائمة المقترحات: '+suggestionError.message);if(!payload.teamId)throw new Error('اختر فرقة المواعيد.');const [{data:locked,error:lockError},{data:booked,error:bookedError}]=await Promise.all([db().rpc('is_installation_schedule_day_locked',{p_schedule_date:payload.scheduledDate}),db().rpc('get_installation_technician_booked_times',{p_schedule_date:payload.scheduledDate,p_technician_name:technicianName,p_exclude_request_id:payload.id||null})]);if(lockError)throw new Error('تعذر التحقق من حالة يوم الجدولة: '+lockError.message);if(locked===true)throw new Error('هذا اليوم مغلق. افتح اليوم أولًا قبل الجدولة.');if(bookedError)throw new Error('تعذر التحقق من موعد الفني: '+bookedError.message);if((booked||[]).some(x=>String(x.scheduled_time||'').slice(0,5)===String(payload.scheduledTime).slice(0,5)))throw new Error('هذا الموعد محجوز للفني المحدد. اختر موعدًا آخر.');const {error}=await db().rpc('schedule_installation_request_visit',{p_request_id:payload.id,p_scheduled_date:payload.scheduledDate,p_scheduled_time:payload.scheduledTime,p_team_id:payload.teamId,p_technician_name:technicianName,p_assignment_notes:payload.assignmentNotes||null});if(error)throw new Error('تعذر حفظ الجدولة والإسناد: '+error.message);void notifyEvent(existed?'installation.rescheduled':'installation.scheduled',payload.id,null,{scheduledDate:payload.scheduledDate,scheduledTime:payload.scheduledTime,teamId:payload.teamId},payload.scheduledDate+'@'+payload.scheduledTime)}
  async function saveTechnician(payload){requireAction(payload.id?'edit':'add','installationSchedule');const record={full_name:payload.name,phone:payload.phone||null,specialty:payload.specialty||null,city:payload.city||null,status:payload.status||'متاح'};let q=payload.id?db().from('installation_technicians').update(record).eq('id',payload.id):db().from('installation_technicians').insert(record);const {error}=await q;if(error)throw new Error('تعذر حفظ بيانات الفني: '+error.message)}
  async function removeTechnician(id){requireAction('delete','installationSchedule');const {error}=await db().from('installation_technicians').delete().eq('id',id);if(error)throw new Error('تعذر حذف الفني: '+error.message)}

  async function executionWorkspace(){
    requireAction('view','installationExecution');
    const [requestResult,visitResult,anyVisitResult,lineResult]=await Promise.all([
      db().from('installation_requests').select('*,customer:customers(id,customer_name,phone),team:installation_teams(id,name,status,groomer_name,driver_name),representative:sales_representatives(id,full_name),services:installation_request_services(id,service_type_id,quantity,unit_price,line_total,service_type:installation_service_types(id,name,service_code)),collection:installation_request_collection(amount_collected,collection_status,payment_method,collection_reference,collection_notes,collected_at)').or('installation_team_id.not.is.null,assigned_technician_name.not.is.null').order('scheduled_date',{ascending:true,nullsFirst:false}).order('scheduled_time',{ascending:true,nullsFirst:false}),
      db().from('installation_execution_visits').select('id,installation_request_id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status,selected_for_execution_at,selected_for_execution_by,on_route_at,map_opened_at,arrived_at,started_at,collection_at,completed_at,execution_notes,team:installation_teams(id,name,groomer_name,driver_name)').in('status',['مجدولة','قيد التنفيذ','بانتظار التأكيد']).order('scheduled_date',{ascending:true}).order('scheduled_time',{ascending:true}),
      db().from('installation_execution_visits').select('id,installation_request_id,scheduled_date,installation_team_id,status'),
      db().from('installation_execution_visit_services').select('visit_id,request_service_id,scheduled_quantity')
    ]);
    if(requestResult.error)throw new Error('تعذر تحميل مهام التنفيذ: '+requestResult.error.message);
    if(visitResult.error&&visitResult.error.code!=='42P01')throw new Error('تعذر تحميل زيارات التنفيذ: '+visitResult.error.message);
    if(anyVisitResult.error&&anyVisitResult.error.code!=='42P01')throw new Error('تعذر التحقق من سجل زيارات التنفيذ: '+anyVisitResult.error.message);
    if(lineResult.error&&lineResult.error.code!=='42P01')throw new Error('تعذر تحميل خدمات زيارات التنفيذ: '+lineResult.error.message);
    const requests=requestResult.data||[],visits=visitResult.data||[],allVisitRefs=anyVisitResult.data||[],visitLines=lineResult.data||[];
    const executionNeighborhoodIds=[...new Set(requests.map(r=>r.neighborhood_id).filter(Boolean))];
    const neighborhoodResult=executionNeighborhoodIds.length?await db().from('installation_neighborhoods').select('id,name').in('id',executionNeighborhoodIds):{data:[],error:null};
    if(neighborhoodResult.error)throw new Error('تعذر تحميل ترجمة أحياء التنفيذ: '+neighborhoodResult.error.message);
    const executionNeighborhoods=new Map((neighborhoodResult.data||[]).map(n=>[String(n.id),{name:n.name||''}]));
    const requestsWithAnyVisit=new Set(allVisitRefs.map(v=>String(v.installation_request_id||'')).filter(Boolean));
    const lineMap=new Map();
    visitLines.forEach(x=>{const a=lineMap.get(x.visit_id)||[];a.push(x);lineMap.set(x.visit_id,a)});
    // P5.13.8.6: canonical execution-group financial allocation recovery.
    // Only live/confirmed execution visits participate in financial allocation. Historical
    // cancelled/replaced visits must never duplicate service value. If visit-service data
    // is over-allocated, normalize shares against the allocated subtotal so the execution
    // groups can never exceed the request's canonical final_amount.
    const requestById=new Map(requests.map(r=>[String(r.id),r]));
    const allFinancialGroups=new Map();
    const financialVisitStatuses=new Set(['مجدولة','قيد التنفيذ','بانتظار التأكيد','مؤكدة']);
    const financialVisitRefs=allVisitRefs.filter(v=>financialVisitStatuses.has(String(v.status||'').trim()));
    financialVisitRefs.forEach(v=>{
      const requestId=String(v.installation_request_id||'');
      const request=requestById.get(requestId);
      if(!request)return;
      const prices=new Map((request.services||[]).map(s=>[String(s.id),Number(s.unit_price||0)]));
      const subtotal=(lineMap.get(v.id)||[]).reduce((sum,line)=>sum+(Number(line.scheduled_quantity||0)*Number(prices.get(String(line.request_service_id))||0)),0);
      const key=[requestId,String(v.installation_team_id||''),String(v.scheduled_date||'')].join('|');
      const current=allFinancialGroups.get(key)||{requestId,key,subtotal:0,date:String(v.scheduled_date||''),teamId:String(v.installation_team_id||'')};
      current.subtotal+=subtotal;
      allFinancialGroups.set(key,current);
    });
    const financialAllocationByGroup=new Map();
    const financialGroupsByRequest=new Map();
    allFinancialGroups.forEach(group=>{const arr=financialGroupsByRequest.get(group.requestId)||[];arr.push(group);financialGroupsByRequest.set(group.requestId,arr)});
    financialGroupsByRequest.forEach((groups,requestId)=>{
      const request=requestById.get(requestId);if(!request)return;
      const requestSubtotal=Math.max(0,Number(request.total_services_amount||0));
      const requestTax=Math.max(0,Number(request.tax_amount||0));
      const requestDiscount=Math.max(0,Number(request.discount_amount||0));
      const requestFinal=Math.max(0,Number(request.final_amount||0));
      const allocatedSubtotal=groups.reduce((sum,g)=>sum+Math.max(0,Number(g.subtotal||0)),0);
      if(requestSubtotal<=0||allocatedSubtotal<=0)return;
      const fullyAllocated=Math.abs(allocatedSubtotal-requestSubtotal)<=0.01;
      const overAllocated=allocatedSubtotal>requestSubtotal+0.01;
      const allocationBase=overAllocated?allocatedSubtotal:requestSubtotal;
      groups.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.teamId).localeCompare(String(b.teamId))||String(a.key).localeCompare(String(b.key)));
      let taxUsed=0,discountUsed=0,finalUsed=0;
      groups.forEach((g,index)=>{
        const share=Math.max(0,Number(g.subtotal||0))/allocationBase;
        const last=(fullyAllocated||overAllocated)&&index===groups.length-1;
        const tax=last?Math.max(0,Math.round((requestTax-taxUsed)*100)/100):Math.max(0,Math.round(requestTax*share*100)/100);
        const discount=last?Math.max(0,Math.round((requestDiscount-discountUsed)*100)/100):Math.max(0,Math.round(requestDiscount*share*100)/100);
        const finalAmount=last?Math.max(0,Math.round((requestFinal-finalUsed)*100)/100):Math.max(0,Math.round(requestFinal*share*100)/100);
        taxUsed+=tax;discountUsed+=discount;finalUsed+=finalAmount;
        financialAllocationByGroup.set(g.key,{subtotal:Math.round(Number(g.subtotal||0)*100)/100,taxAmount:tax,discountAmount:discount,finalAmount});
      });
    });
    const visitsByRequest=new Map();
    visits.forEach(v=>{const a=visitsByRequest.get(v.installation_request_id)||[];a.push(v);visitsByRequest.set(v.installation_request_id,a)});
    const normalizeRequest=(r)=>({
      id:r.id,requestNumber:r.request_number,customerName:r.customer?.customer_name||'',customerPhone:r.customer?.phone||'',representativeId:r.representative_id||'',representativeName:r.representative?.full_name||'',scheduledDate:r.scheduled_date||'',scheduledTime:String(r.scheduled_time||'').slice(0,5),status:r.status||'مسند',priority:r.priority||'عادية',technicianName:r.assigned_technician_name||'',teamId:r.installation_team_id||'',teamName:r.team?.name||'',groomerName:r.team?.groomer_name||r.assigned_technician_name||'',driverName:r.team?.driver_name||'',installationAddress:r.installation_address||'',neighborhoodId:r.neighborhood_id||'',neighborhoodName:executionNeighborhoods.get(String(r.neighborhood_id||''))?.name||r.installation_address||'',customerMapUrl:r.customer_map_url||'',assignmentNotes:r.assignment_notes||'',requestNotes:r.notes||'',displayNotes:r.assignment_notes||r.notes||'',executionNotes:r.execution_notes||'',selectedForExecutionAt:r.selected_for_execution_at||'',selectedForExecutionBy:r.selected_for_execution_by||'',isCurrentUserSelection:false,mapOpenedAt:r.map_opened_at||'',onRouteAt:r.on_route_at||'',arrivedAt:r.arrived_at||'',startedAt:r.started_at||'',collectionAt:r.collection_at||'',completedAt:r.completed_at||'',collection:{amountCollected:Number(r.collection?.amount_collected||0),collectionStatus:r.collection?.collection_status||'غير محصل',paymentMethod:r.collection?.payment_method||'',reference:r.collection?.collection_reference||'',notes:r.collection?.collection_notes||'',collectedAt:r.collection?.collected_at||''},totalServicesCount:Number(r.total_services_count||0),totalServicesAmount:Number(r.total_services_amount||0),taxRate:Number(r.tax_rate??15),taxAmount:Number(r.tax_amount||0),discountAmount:Number(r.discount_amount||0),finalAmount:Number(r.final_amount||0),grossServicesAmount:Number(r.total_services_amount||0)+Number(r.tax_amount||0),services:(r.services||[]).map(x=>({id:x.id,serviceTypeId:x.service_type_id||x.service_type?.id||'',serviceCode:x.service_type?.service_code||'',name:x.service_type?.name||'خدمة',quantity:Number(x.quantity||0),unitPrice:Number(x.unit_price||0),lineTotal:Number(x.line_total||0)}))
    });
    const output=[];
    requests.forEach(r=>{
      const base=normalizeRequest(r),own=visitsByRequest.get(r.id)||[];
      if(!own.length){
        // Legacy fallback is allowed only for requests that truly have no execution visits at all.
        // If historical visits exist but none are active (for example all are confirmed/completed),
        // the request must stay out of the execution workspace and must never reappear as a new task.
        if(requestsWithAnyVisit.has(String(r.id)))return;
        output.push({...base,visitSyncMissing:true,selectedForExecutionAt:'',selectedForExecutionBy:'',isCurrentUserSelection:false,mapOpenedAt:'',onRouteAt:'',arrivedAt:'',startedAt:'',collectionAt:'',completedAt:'',status:['ملغي'].includes(String(base.status||'').trim())?base.status:'مسند'});return;
      }
      own.forEach(v=>{
        const allocations=new Map((lineMap.get(v.id)||[]).map(x=>[x.request_service_id,Number(x.scheduled_quantity||0)]));
        const allocated=base.services.map(x=>{const quantity=allocations.has(x.id)?allocations.get(x.id):0;return {...x,quantity,lineTotal:quantity*Number(x.unitPrice||0)}}).filter(x=>x.quantity>0);
        const services=allocated.length?allocated:base.services;
        output.push({...base,scheduleEntryId:v.id,visitId:v.id,visitNo:Number(v.visit_no||0),executionNumber:`${base.requestNumber}-${String(Number(v.visit_no||0)).padStart(2,'0')}`,scheduledDate:v.scheduled_date||base.scheduledDate,scheduledTime:String(v.scheduled_time||base.scheduledTime||'').slice(0,5),teamId:v.installation_team_id||base.teamId,teamName:v.team?.name||base.teamName,groomerName:v.team?.groomer_name||v.technician_name||base.groomerName||base.technicianName,driverName:v.team?.driver_name||base.driverName,technicianName:v.technician_name||base.technicianName,visitStatus:v.status||'',status:v.completed_at?'مكتمل':(v.started_at?'قيد التنفيذ':(v.arrived_at?'وصل إلى العميل':(v.on_route_at?'في الطريق':'مسند'))),selectedForExecutionAt:v.selected_for_execution_at||'',selectedForExecutionBy:v.selected_for_execution_by||'',isCurrentUserSelection:Boolean(v.selected_for_execution_at)&&!v.completed_at&&['مجدولة','قيد التنفيذ'].includes(String(v.status||'')),onRouteAt:v.on_route_at||'',mapOpenedAt:v.map_opened_at||'',arrivedAt:v.arrived_at||'',startedAt:v.started_at||'',collectionAt:v.collection_at||'',completedAt:v.completed_at||'',executionNotes:v.execution_notes||'',services,totalServicesCount:services.reduce((a,x)=>a+Number(x.quantity||0),0),totalServicesAmount:services.reduce((a,x)=>a+Number(x.lineTotal||0),0)});
      });
    });
    // P5.11.4.10.2: same request + same team + same local date executes as one workflow.
    const grouped=new Map();
    for(const item of output){
      if(!item.visitId){grouped.set(`legacy:${item.id}`,item);continue;}
      const key=[item.id,item.teamId||'',item.scheduledDate||''].join('|');
      const existing=grouped.get(key);
      if(!existing){grouped.set(key,{...item,groupVisitIds:[item.visitId],slotTimes:[item.scheduledTime],services:(item.services||[]).map(x=>({...x}))});continue;}
      existing.groupVisitIds.push(item.visitId);
      existing.slotTimes.push(item.scheduledTime);
      existing.visitNo=Math.min(Number(existing.visitNo||999999),Number(item.visitNo||999999));
      existing.executionNumber=`${existing.requestNumber}-${String(Number(existing.visitNo||0)).padStart(2,'0')}`;
      existing.isCurrentUserSelection=existing.isCurrentUserSelection||item.isCurrentUserSelection;
      existing.selectedForExecutionAt=existing.selectedForExecutionAt||item.selectedForExecutionAt;
      existing.selectedForExecutionBy=existing.selectedForExecutionBy||item.selectedForExecutionBy;
      existing.onRouteAt=existing.onRouteAt||item.onRouteAt; existing.mapOpenedAt=existing.mapOpenedAt||item.mapOpenedAt; existing.arrivedAt=existing.arrivedAt||item.arrivedAt; existing.startedAt=existing.startedAt||item.startedAt; existing.collectionAt=existing.collectionAt||item.collectionAt; existing.completedAt=existing.completedAt||item.completedAt;
      const byService=new Map((existing.services||[]).map(x=>[String(x.id),x]));
      for(const svc of (item.services||[])){const k=String(svc.id);if(byService.has(k)){const x=byService.get(k);x.quantity=Number(x.quantity||0)+Number(svc.quantity||0);x.lineTotal=Number(x.lineTotal||0)+Number(svc.lineTotal||0);}else{const x={...svc};existing.services.push(x);byService.set(k,x);}}
      existing.totalServicesCount=(existing.services||[]).reduce((a,x)=>a+Number(x.quantity||0),0);
      existing.totalServicesAmount=(existing.services||[]).reduce((a,x)=>a+Number(x.lineTotal||0),0);
    }
    return [...grouped.values()].map(x=>{
      if(Array.isArray(x.slotTimes)){x.slotTimes=[...new Set(x.slotTimes.filter(Boolean))].sort();x.scheduledTime=x.slotTimes[0]||x.scheduledTime;x.executionSlotLabel=x.slotTimes.length>1?`${x.slotTimes[0]} - ${x.slotTimes[x.slotTimes.length-1]} (${x.slotTimes.length} مواعيد)`:x.scheduledTime;}
      if(x.visitId){
        const financialKey=[String(x.id||''),String(x.teamId||''),String(x.scheduledDate||'')].join('|');
        const allocation=financialAllocationByGroup.get(financialKey);
        if(allocation){
          x.totalServicesAmount=allocation.subtotal;
          x.taxAmount=allocation.taxAmount;
          x.discountAmount=allocation.discountAmount;
          x.finalAmount=allocation.finalAmount;
          x.grossServicesAmount=Math.round((allocation.subtotal+allocation.taxAmount)*100)/100;
          x.executionFinancialScope='group';
        }
      }
      return x;
    });
  }
  async function executionIdentity(){
    requireAction('view','installationExecution');
    const profile=window.CustomerAuth?.getState?.().profile||{};
    const role=String(profile.role||'').trim();
    const [{data:binding,error:bindingError},{data:scope,error:scopeError}]=await Promise.all([
      db().from('installation_user_technician_bindings').select('installation_team_id,technician_name,team:installation_teams(id,name)').maybeSingle(),
      db().from('installation_data_access_profiles').select('access_mode').maybeSingle()
    ]);
    if(bindingError&&bindingError.code!=='PGRST116')throw new Error('تعذر تحميل هوية الجرومر / السائق: '+bindingError.message);
    if(scopeError&&scopeError.code!=='PGRST116'&&scopeError.code!=='42P01')throw new Error('تعذر تحميل نطاق تنفيذ المواعيد: '+scopeError.message);
    const accessMode=role==='super_admin'?'all':String(scope?.access_mode||'own').trim().toLowerCase();
    const isTechnicianRole=role==='viewer';
    const technicianName=String(binding?.technician_name||'').trim();
    const teamId=String(binding?.installation_team_id||'').trim();
    const lockIdentity=Boolean(isTechnicianRole&&accessMode==='own'&&teamId);
    return {
      role,
      accessMode,
      lockIdentity,
      teamId,
      teamName:binding?.team?.name||'',
      technicianName,
      canEdit:Boolean(window.CustomerPermissions?.canAction?.('installationExecution','edit')),canReturnToSchedule:['super_admin','sales_manager'].includes(role),
      canObserveInProgress:['super_admin','customer_service','sales_manager','sales_supervisor','sales_representative','viewer'].includes(role)
    };
  }
  async function selectExecutionRequest(id,visitId){requireAction('edit','installationExecution');const {error}=await db().rpc('select_installation_execution_visit',{p_request_id:id,p_visit_id:visitId||null});if(error)throw new Error('تعذر اختيار زيارة التنفيذ الحالية: '+error.message);void notifyEvent('installation.execution_selected',id,visitId||null,{source:'execution_selection'},'selected:'+String(visitId||id))}
  async function recordMapOpened(id,visitId){requireAction('edit','installationExecution');if(visitId){const {error}=await db().rpc('record_installation_visit_map_opened',{p_request_id:id,p_visit_id:visitId});if(error)throw new Error('تعذر تسجيل فتح موقع العميل: '+error.message);void notifyEvent('installation.map_opened',id,visitId,{source:'execution'},'map:'+visitId);return}const {error}=await db().rpc('record_installation_map_opened',{p_request_id:id});if(error)throw new Error('تعذر تسجيل فتح موقع العميل: '+error.message);void notifyEvent('installation.map_opened',id,null,{source:'execution'},'map:'+id)}
  async function returnExecutionToSchedule(id,reason){
    const role=String(window.CustomerPermissions?.currentRole?.()||window.CustomerAuth?.getState?.().profile?.role||'').trim();
    if(!['super_admin','sales_manager'].includes(role))throw new Error('إلغاء الطلب وإعادته للجدولة متاح للسوبر أدمن ومدير المبيعات فقط.');
    if(!id)throw new Error('معرّف الموعد مطلوب.');
    reason=String(reason||'').trim();
    if(!reason)throw new Error('سبب إعادة الجدولة مطلوب.');
    const {data,error}=await db().rpc('return_installation_execution_to_schedule',{p_request_id:id,p_reason:reason});
    if(error)throw new Error('تعذر إلغاء الطلب وإعادته إلى الجدولة: '+error.message);
    void notifyEvent('installation.execution_returned_to_schedule',id,null,{source:'current_execution',reason,stage:data?.stage||''},'return-schedule:'+id+':'+Date.now());
    return data;
  }
  async function uploadExecutionFile(requestId,file){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('صيغة الصورة غير مدعومة.');
    if(file.size<1||file.size>10485760)throw new Error('حجم الصورة يجب أن يكون بين 1 بايت و10 ميجابايت.');
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path=`${requestId}/execution/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucket=db().storage.from('installation-evidence');
    const {error:up}=await bucket.upload(path,file,{contentType:file.type,upsert:false});
    if(up)throw new Error('تعذر رفع صورة التنفيذ: '+up.message);
    const {data:record,error}=await db().from('installation_execution_files').insert({installation_request_id:requestId,storage_path:path,original_name:file.name,mime_type:file.type,file_size:file.size}).select('id,storage_path').single();
    if(error){await bucket.remove([path]);throw new Error('تعذر تسجيل صورة التنفيذ: '+error.message);}
    return {id:record?.id||null,path};
  }
  async function rollbackExecutionFiles(files){
    const saved=(files||[]).filter(Boolean);
    if(!saved.length)return;
    const ids=saved.map(x=>x.id).filter(Boolean),paths=saved.map(x=>x.path).filter(Boolean);
    if(ids.length)await db().from('installation_execution_files').delete().in('id',ids);
    if(paths.length)await db().storage.from('installation-evidence').remove(paths);
  }
  async function completeCollectionStage(payload){requireAction('edit','installationExecution');const amount=Number(payload.amountCollected||0);if(!Number.isFinite(amount)||amount<0)throw new Error('المبلغ المستلم غير صحيح.');const paymentMethod=String(payload.paymentMethod||'').trim();if(amount>0&&!paymentMethod)throw new Error('طريقة التحصيل مطلوبة.');const {error}=await db().rpc('complete_installation_collection_stage',{p_request_id:payload.id,p_visit_id:payload.visitId||null,p_amount_received:amount,p_payment_method:paymentMethod||null,p_reference:String(payload.reference||'').trim()||null,p_notes:String(payload.notes||'').trim()||null});if(error)throw new Error('تعذر تأكيد مرحلة التحصيل: '+error.message);void notifyEvent('installation.collection_completed',payload.id,payload.visitId||null,{amountCollected:amount,paymentMethod},'collection:'+String(payload.visitId||payload.id))}
  async function advanceExecution(payload){
    requireAction('edit','installationExecution');
    const allowed=['في الطريق','وصل إلى العميل','قيد التنفيذ','مكتمل'];
    if(!allowed.includes(payload.nextStatus))throw new Error('مرحلة التنفيذ غير مسموحة.');
    const uploaded=[];
    try{
      if(payload.nextStatus==='مكتمل'&&payload.photos?.length){for(const f of payload.photos)uploaded.push(await uploadExecutionFile(payload.id,f));}
      const rpc=payload.visitId?'advance_installation_execution_visit_stage':'advance_installation_execution_stage';
      const args=payload.visitId?{p_request_id:payload.id,p_visit_id:payload.visitId,p_next_status:payload.nextStatus,p_notes:payload.notes||null}:{p_request_id:payload.id,p_next_status:payload.nextStatus,p_notes:payload.notes||null};
      const {error}=await db().rpc(rpc,args);
      if(error)throw new Error('تعذر تحديث مرحلة التنفيذ: '+error.message);
      const eventKey={'في الطريق':'installation.on_route','وصل إلى العميل':'installation.arrived','قيد التنفيذ':'installation.work_started','مكتمل':'installation.completed'}[payload.nextStatus];
      if(eventKey)void notifyEvent(eventKey,payload.id,payload.visitId||null,{status:payload.nextStatus},payload.nextStatus+':'+String(payload.visitId||payload.id));
    }catch(error){
      if(uploaded.length)await rollbackExecutionFiles(uploaded).catch(()=>{});
      throw error;
    }
  }
  async function completionQuantitySummary(requestId,visitId){
    requireAction('view','installationCompletion');
    if(!requestId)throw new Error('معرّف الموعد مطلوب.');
    if(visitId){
      const {data,error}=await db().rpc('get_installation_execution_visit_quantity_summary',{p_request_id:requestId,p_visit_id:visitId});
      if(error)throw new Error('تعذر تحديث كميات زيارة التنفيذ: '+error.message);
      return (data||[]).map(x=>({requestServiceId:x.request_service_id,serviceName:x.service_name,requestedQuantity:Number(x.requested_quantity||0),scheduledCurrentQuantity:Number(x.scheduled_current_quantity||0),executedQuantity:Number(x.executed_quantity||0),remainingQuantity:Number(x.remaining_quantity||0),unitPrice:Number(x.unit_price||0)}));
    }
    const {data,error}=await db().from('installation_request_services').select('id,quantity,unit_price,service:installation_service_types(name)').eq('installation_request_id',requestId).order('created_at',{ascending:true});
    if(error)throw new Error('تعذر تحديث كميات الموعد: '+error.message);
    return (data||[]).map(x=>({requestServiceId:x.id,serviceName:x.service?.name||'خدمة',requestedQuantity:Number(x.quantity||0),scheduledCurrentQuantity:Number(x.quantity||0),executedQuantity:0,remainingQuantity:Number(x.quantity||0),unitPrice:Number(x.unit_price||0)}));
  }
  async function saveCompletionWorkspace(payload){
    requireAction('edit','installationCompletion');
    if(!payload?.id)throw new Error('معرّف الموعد مطلوب.');
    if(!Array.isArray(payload.services)||!payload.services.length)throw new Error('أضف خدمة واحدة على الأقل.');
    const services=payload.services.map(x=>({service_type_id:x.serviceTypeId,quantity:Number(x.quantity),unit_price:Number(x.unitPrice)}));
    if(services.some(x=>!x.service_type_id||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unit_price)||x.unit_price<0))throw new Error('راجع نوع الخدمة والعدد والسعر في جميع الخدمات.');
    const amount=Number(payload.collection?.amountCollected||0),discount=Number(payload.discountAmount||0);
    if(!Number.isFinite(amount)||amount<0)throw new Error('المبلغ المحصل غير صحيح.');
    if(!Number.isFinite(discount)||discount<0)throw new Error('قيمة الخصم غير صحيحة.');
    const {data,error}=await db().rpc('update_installation_completion_workspace',{p_request_id:payload.id,p_visit_id:payload.visitId||null,p_services:services,p_discount_amount:discount,p_collection:{amount_collected:amount,payment_method:String(payload.collection?.paymentMethod||'').trim(),invoice_number:String(payload.collection?.invoiceNumber||'').trim(),collection_notes:String(payload.collection?.notes||'').trim()}});
    if(error)throw new Error('تعذر حفظ تحديثات الخدمات والتحصيل: '+error.message);
    void notifyEvent('installation.request_updated',payload.id,payload.visitId||null,{source:'completion_confirmation',services:services.length},'completion-edit:'+new Date().toISOString());
    return Array.isArray(data)?data[0]:data;
  }
  async function confirmActualQuantities(payload){requireAction('edit','installationCompletion');const rpc=payload.visitId?'confirm_installation_execution_visit_quantities':'confirm_installation_actual_quantities';const args=payload.visitId?{p_request_id:payload.id,p_visit_id:payload.visitId,p_lines:payload.lines||[],p_remaining_action:payload.remainingAction,p_schedule:payload.schedule||null,p_notes:payload.notes||null}:{p_request_id:payload.id,p_lines:payload.lines||[],p_remaining_action:payload.remainingAction,p_schedule:payload.schedule||null,p_notes:payload.notes||null};const {data,error}=await db().rpc(rpc,args);if(error)throw new Error('تعذر اعتماد التنفيذ الفعلي: '+error.message);void notifyEvent('installation.quantities_confirmed',payload.id,payload.visitId||null,{remainingAction:payload.remainingAction},'confirm:'+String(payload.visitId||payload.id));if(payload.remainingAction==='append_to_next_visit')void notifyEvent('installation.remaining_added_to_next',payload.id,payload.visitId||null,{},'remaining-next:'+String(payload.visitId||payload.id));if(payload.remainingAction==='return_to_schedule')void notifyEvent('installation.remaining_to_schedule',payload.id,payload.visitId||null,{},'remaining-schedule:'+String(payload.visitId||payload.id));return data}
  async function cancelConfirmedQuantity(payload){
    if(window.CustomerPermissions?.currentRole?.()!=='super_admin')throw new Error('إلغاء الكمية المنفذة متاح لمدير النظام فقط.');
    if(!payload?.id||!payload?.visitId)throw new Error('بيانات زيارة التنفيذ غير مكتملة.');
    const {error}=await db().rpc('cancel_installation_execution_visit_confirmation',{p_request_id:payload.id,p_visit_id:payload.visitId,p_reason:payload.reason||null});
    if(error)throw new Error('تعذر إلغاء تأكيد الكمية المنفذة: '+error.message);
    return true;
  }
  async function completionList(){
    requireAction('view','installationCompletion');
    const [requests,reports,files,invoices,serviceRows,pendingVisits,confirmedHistoryVisits,scheduledVisits,scheduledVisitLines,collectionRows]=await Promise.all([
      fetchPaged((from,to)=>db().from('installation_requests').select('*,customer:customers(id,customer_name,phone),technician:installation_technicians(id,full_name),representative:sales_representatives(id,full_name),team:installation_teams(id,name)').eq('status','مكتمل').order('completed_at',{ascending:false,nullsFirst:false}).range(from,to)),
      fetchPaged((from,to)=>db().from('installation_completion_reports').select('*').range(from,to)),fetchPaged((from,to)=>db().from('installation_completion_files').select('*').range(from,to),1000),fetchPaged((from,to)=>db().from('sales_invoices').select('installation_request_id,installation_execution_visit_id,status').eq('source_type','installation').neq('status','ملغاة').range(from,to),1000),fetchPaged((from,to)=>db().from('installation_request_services').select('id,installation_request_id,quantity,line_total,service:installation_service_types(default_cost)').range(from,to),1000),
      fetchPaged((from,to)=>db().from('installation_execution_visits').select('id,installation_request_id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status,completed_at,team:installation_teams(id,name)').eq('status','بانتظار التأكيد').order('completed_at',{ascending:false,nullsFirst:false}).range(from,to),1000),
      fetchPaged((from,to)=>db().from('installation_execution_visits').select('id,installation_request_id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status,completed_at,team:installation_teams(id,name)').eq('status','مؤكدة').order('completed_at',{ascending:false,nullsFirst:false}).range(from,to),1000),
      fetchPaged((from,to)=>db().from('installation_execution_visits').select('id,installation_request_id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status').eq('status','مجدولة').order('scheduled_date',{ascending:true,nullsFirst:false}).order('scheduled_time',{ascending:true,nullsFirst:false}).range(from,to),1000),
      fetchPaged((from,to)=>db().from('installation_execution_visit_services').select('visit_id,request_service_id,scheduled_quantity').range(from,to),1000),
      fetchPaged((from,to)=>db().from('installation_request_collection').select('installation_request_id,invoice_number').range(from,to),1000)
    ]);
    const legacyInvoicedRequestIds=new Set(invoices.filter(x=>!x.installation_execution_visit_id).map(x=>x.installation_request_id).filter(Boolean)),invoicedVisitIds=new Set(invoices.map(x=>x.installation_execution_visit_id).filter(Boolean)),reportMap=new Map(reports.map(x=>[x.installation_request_id,x])),collectionInvoiceMap=new Map((collectionRows||[]).map(x=>[String(x.installation_request_id),x.invoice_number||''])),filesMap=new Map(),amountMap=new Map(),costMap=new Map(),serviceCostMap=new Map();files.forEach(f=>{const arr=filesMap.get(f.installation_request_id)||[];arr.push(f);filesMap.set(f.installation_request_id,arr)});serviceRows.forEach(x=>{amountMap.set(x.installation_request_id,(amountMap.get(x.installation_request_id)||0)+Number(x.line_total||0));costMap.set(x.installation_request_id,(costMap.get(x.installation_request_id)||0)+(Number(x.quantity||0)*Number(x.service?.default_cost||0)));serviceCostMap.set(String(x.id),Number(x.service?.default_cost||0))});
    const requestMap=new Map(requests.map(r=>[String(r.id),r]));
    const pendingRequestIds=[...new Set([...pendingVisits,...confirmedHistoryVisits].map(v=>String(v.installation_request_id)))];
    if(pendingRequestIds.length){const {data:extra,error}=await db().from('installation_requests').select('*,customer:customers(id,customer_name,phone),technician:installation_technicians(id,full_name),representative:sales_representatives(id,full_name),team:installation_teams(id,name)').in('id',pendingRequestIds);if(error)throw new Error('تعذر تحميل طلبات زيارات التأكيد: '+error.message);(extra||[]).forEach(r=>requestMap.set(String(r.id),r))}
    const baseRow=(r,v=null)=>({rowKey:v?`visit:${v.id}`:`request:${r.id}`,id:r.id,visitId:v?.id||'',visitNo:Number(v?.visit_no||0),requestNumber:r.request_number,executionNumber:v?`${r.request_number}-${String(Number(v.visit_no||0)).padStart(2,'0')}`:r.request_number,customerOrderNumber:r.customer_order_number||'',customerName:r.customer?.customer_name||'',customerPhone:r.customer?.phone||'',technicianName:v?.technician_name||r.assigned_technician_name||r.technician?.full_name||'',representativeId:r.representative_id||r.representative?.id||'',representativeName:r.representative?.full_name||'',teamId:v?.installation_team_id||r.installation_team_id||'',teamName:v?.team?.name||r.team?.name||'',installationAddress:r.installation_address||'',requestCreatedAt:r.created_at||'',completedAt:v?.completed_at||r.completed_at||'',invoiceAmount:Number(r.total_services_amount||amountMap.get(r.id)||0),installationExpenses:Number(costMap.get(r.id)||0),report:reportMap.get(r.id)||null,collectionInvoiceNumber:collectionInvoiceMap.get(String(r.id))||'',files:filesMap.get(r.id)||[],quantityConfirmed:!v});
    const out=[];
    const scheduledLinesByVisit=new Map();scheduledVisitLines.forEach(x=>{const a=scheduledLinesByVisit.get(String(x.visit_id))||[];a.push(x);scheduledLinesByVisit.set(String(x.visit_id),a)});
    for(const v of confirmedHistoryVisits){const r=requestMap.get(String(v.installation_request_id));if(!r||legacyInvoicedRequestIds.has(r.id)||invoicedVisitIds.has(v.id))continue;const row=baseRow(r,v);row.quantityConfirmed=true;row.confirmedHistory=true;row.completedAt=v.completed_at||r.completed_at||'';const {data,error}=await db().rpc('get_installation_execution_visit_quantity_summary',{p_request_id:r.id,p_visit_id:v.id});if(!error){row.quantities=(data||[]).map(x=>({requestServiceId:x.request_service_id,serviceName:x.service_name,requestedQuantity:Number(x.requested_quantity||0),scheduledCurrentQuantity:Number(x.scheduled_current_quantity||0),executedQuantity:Number(x.executed_quantity||0),remainingQuantity:Number(x.remaining_quantity||0),unitPrice:Number(x.unit_price||0)}));row.invoiceAmount=row.quantities.reduce((n,q)=>n+(Number(q.executedQuantity||0)*Number(q.unitPrice||0)),0);row.installationExpenses=row.quantities.reduce((n,q)=>n+(Number(q.executedQuantity||0)*Number(serviceCostMap.get(String(q.requestServiceId))||0)),0)}out.push(row)}
    for(const v of pendingVisits){const r=requestMap.get(String(v.installation_request_id));if(!r||legacyInvoicedRequestIds.has(r.id))continue;const row=baseRow(r,v);const {data,error}=await db().rpc('get_installation_execution_visit_quantity_summary',{p_request_id:r.id,p_visit_id:v.id});if(error)throw new Error('تعذر تحميل كميات زيارة التنفيذ: '+error.message);row.quantities=(data||[]).map(x=>({requestServiceId:x.request_service_id,serviceName:x.service_name,requestedQuantity:Number(x.requested_quantity||0),scheduledCurrentQuantity:Number(x.scheduled_current_quantity||0),executedQuantity:Number(x.executed_quantity||0),remainingQuantity:Number(x.remaining_quantity||0),unitPrice:Number(x.unit_price||0)}));const next=(scheduledVisits||[]).filter(x=>String(x.installation_request_id)===String(r.id)&&Number(x.visit_no)>Number(v.visit_no||0)).sort((a,b)=>String(a.scheduled_date||'').localeCompare(String(b.scheduled_date||''))||String(a.scheduled_time||'').localeCompare(String(b.scheduled_time||''))||Number(a.visit_no||0)-Number(b.visit_no||0))[0]||null;row.nextScheduledVisit=next?{id:next.id,visitNo:Number(next.visit_no||0),scheduledDate:next.scheduled_date||'',scheduledTime:String(next.scheduled_time||'').slice(0,5),teamId:next.installation_team_id||'',technicianName:next.technician_name||'',lines:(scheduledLinesByVisit.get(String(next.id))||[]).map(x=>({requestServiceId:x.request_service_id,scheduledQuantity:Number(x.scheduled_quantity||0)}))}:null;out.push(row)}
    // Legacy completed requests that predate execution visits still need a request-level completion row.
    // Never recreate a request-level row for visit-backed execution: confirmed/pending visits are the canonical
    // completion source, and invoiced visits must stay removed after invoice creation.
    const visitBackedRequestIds=new Set([...pendingVisits,...confirmedHistoryVisits].map(v=>String(v.installation_request_id)));
    requests.filter(r=>!legacyInvoicedRequestIds.has(r.id)&&!visitBackedRequestIds.has(String(r.id))).forEach(r=>out.push(baseRow(r,null)));
    // Same-day same-team execution slots are one completion/quantity-confirmation row.
    const groupedOut=new Map();
    for(const row of out){
      if(!row.visitId){groupedOut.set(row.rowKey,row);continue;}
      const key=[row.id,row.teamId||'',String(row.completedAt||'').slice(0,10)||row.scheduledDate||''].join('|');
      const prev=groupedOut.get(key);
      if(!prev){groupedOut.set(key,{...row,groupVisitIds:[row.visitId]});continue;}
      prev.groupVisitIds.push(row.visitId);
      prev.visitNo=Math.min(Number(prev.visitNo||999999),Number(row.visitNo||999999));
      prev.executionNumber=`${prev.requestNumber}-${String(Number(prev.visitNo||0)).padStart(2,'0')}`;
      prev.quantityConfirmed=prev.quantityConfirmed||row.quantityConfirmed;
      prev.confirmedHistory=prev.confirmedHistory||row.confirmedHistory;
      if(Array.isArray(row.quantities)){const qmap=new Map((prev.quantities||[]).map(q=>[String(q.requestServiceId),q]));for(const q of row.quantities){const k=String(q.requestServiceId);if(!qmap.has(k)){(prev.quantities||(prev.quantities=[])).push({...q});qmap.set(k,prev.quantities[prev.quantities.length-1]);}else{const x=qmap.get(k);x.scheduledCurrentQuantity=Math.max(Number(x.scheduledCurrentQuantity||0),Number(q.scheduledCurrentQuantity||0));x.executedQuantity=Math.max(Number(x.executedQuantity||0),Number(q.executedQuantity||0));x.remainingQuantity=Math.min(Number(x.remainingQuantity||0),Number(q.remainingQuantity||0));}}}
    }
    return [...groupedOut.values()];
  }
  async function uploadCompletionFile(requestId,fileKind,file){
    if(!file)return null;
    if(!['before','after','delivery_authorization'].includes(fileKind))throw new Error('نوع مرفق محضر الموعد غير مدعوم.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WEBP.');
    if(file.size<1||file.size>10485760)throw new Error('حجم الصورة يجب أن يكون بين 1 بايت و10 ميجابايت.');
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path=`${requestId}/completion/${fileKind}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const {error:uploadError}=await db().storage.from('installation-evidence').upload(path,file,{contentType:file.type,upsert:false});
    if(uploadError)throw new Error('تعذر رفع مرفق محضر الموعد: '+uploadError.message);
    const {error:recordError}=await db().from('installation_completion_files').insert({installation_request_id:requestId,file_kind:fileKind,storage_path:path,original_name:file.name,mime_type:file.type,file_size:file.size});
    if(recordError){
      await db().storage.from('installation-evidence').remove([path]);
      throw new Error('تعذر تسجيل مرفق محضر الموعد: '+recordError.message);
    }
    return path;
  }
  async function saveCompletion(payload){
    requireAction('edit','installationCompletion');
    requireAction('add','salesInvoices');
    if(!payload?.id)throw new Error('معرّف الموعد مطلوب.');
    const workSummary=String(payload.workSummary||'').trim();
    const recipientName=String(payload.recipientName||'').trim();
    const invoiceNumber=String(payload.invoiceNumber||'').trim();
    const invoiceDate=String(payload.invoiceDate||'').trim();
    if(!workSummary)throw new Error('ملخص الأعمال المنفذة مطلوب.');
    if(!recipientName)throw new Error('اسم مستلم الأعمال مطلوب.');
    if(!invoiceNumber)throw new Error('رقم الفاتورة مطلوب.');
    if(!invoiceDate)throw new Error('تاريخ الفاتورة مطلوب.');
    const report={installation_request_id:payload.id,work_summary:workSummary,recipient_name:recipientName,invoice_number:invoiceNumber,invoice_date:invoiceDate,recipient_role:null,customer_notes:null,signed_at:null};
    const {error:reportError}=await db().from('installation_completion_reports').upsert(report,{onConflict:'installation_request_id'});
    if(reportError)throw new Error('تعذر حفظ محضر إكمال الموعد: '+reportError.message);
    const {error:invoiceSyncError}=await db().rpc('sync_sales_invoice_from_installation',{p_installation_request_id:payload.id});
    if(invoiceSyncError)throw new Error('تم حفظ المحضر لكن تعذر تسجيل فاتورة المبيعات: '+invoiceSyncError.message);
    const jobs=[];
    for(const file of (payload.beforePhotos||[]))jobs.push(uploadCompletionFile(payload.id,'before',file));
    for(const file of (payload.afterPhotos||[]))jobs.push(uploadCompletionFile(payload.id,'after',file));
    if(payload.deliveryAuthorizationFile)jobs.push(uploadCompletionFile(payload.id,'delivery_authorization',payload.deliveryAuthorizationFile));
    for(const job of jobs)await job;
    return true;
  }
  async function signedFileUrl(path,expiresIn=900){const {data,error}=await db().storage.from('installation-evidence').createSignedUrl(path,expiresIn);if(error)throw new Error('تعذر فتح المرفق: '+error.message);return data?.signedUrl||''}
  async function exceptionList(){requireAction('view','installationExceptions');const [{data:requests,error:re},{data:revisits,error:ve}]=await Promise.all([db().from('installation_requests').select('*,customer:customers(id,customer_name,phone),technician:installation_technicians(id,full_name)').in('status',['مؤجل','متعذر']).order('last_status_changed_at',{ascending:false,nullsFirst:false}),db().from('installation_revisits').select('*').order('created_at',{ascending:false})]);if(re)throw new Error('تعذر تحميل استثناءات المواعيد: '+re.message);if(ve)throw new Error('تعذر تحميل إعادة الزيارات: '+ve.message);const map=new Map();(revisits||[]).forEach(v=>{if(!map.has(v.installation_request_id)||v.status==='مجدولة')map.set(v.installation_request_id,v)});return (requests||[]).map(r=>({id:r.id,requestNumber:r.request_number,customerName:r.customer?.customer_name||'',customerPhone:r.customer?.phone||'',technicianId:r.technician_id||'',technicianName:r.assigned_technician_name||r.technician?.full_name||'',scheduledDate:r.scheduled_date||'',status:r.status||'',failureReason:r.execution_failure_reason||'',executionNotes:r.execution_notes||'',activeRevisit:(()=>{const v=map.get(r.id);return v?{id:v.id,scheduledDate:v.scheduled_date||'',timeSlot:v.time_slot||'',technicianId:v.technician_id||'',actionType:v.action_type||'إعادة زيارة',notes:v.notes||'',status:v.status||'مجدولة'}:null})()}))}
  async function saveRevisit(payload){requireAction('edit','installationExceptions');if(!payload.scheduledDate||!payload.technicianId)throw new Error('تاريخ إعادة الزيارة والفني مطلوبان.');const {data:existing,error:ee}=await db().from('installation_revisits').select('id').eq('installation_request_id',payload.requestId).eq('status','مجدولة').maybeSingle();if(ee)throw new Error('تعذر التحقق من إعادة الزيارة: '+ee.message);const record={installation_request_id:payload.requestId,scheduled_date:payload.scheduledDate,time_slot:payload.timeSlot,technician_id:payload.technicianId,action_type:payload.actionType||'إعادة زيارة',notes:payload.notes||null,status:'مجدولة'};let q=existing?.id?db().from('installation_revisits').update(record).eq('id',existing.id):db().from('installation_revisits').insert(record);const {error}=await q;if(error)throw new Error('تعذر حفظ إعادة الزيارة: '+error.message);const {error:ue}=await db().from('installation_requests').update({scheduled_date:payload.scheduledDate,time_slot:payload.timeSlot,technician_id:payload.technicianId,status:'مسند',assignment_notes:payload.notes||null}).eq('id',payload.requestId);if(ue)throw new Error('تم حفظ الزيارة لكن تعذر تحديث الموعد: '+ue.message);void notifyEvent('installation.revisit_scheduled',payload.requestId,null,{scheduledDate:payload.scheduledDate,actionType:payload.actionType||'إعادة زيارة'},'revisit:'+payload.scheduledDate)}
  async function operationalReport(filters={}){
    requireAction('view','installationReports');
    let q=db().from('installation_requests').select('id,request_number,status,scheduled_date,installation_team_id,technician_id,assigned_technician_name,representative_id,total_services_amount,tax_amount,discount_amount,final_amount,started_at,completed_at,execution_failure_reason,customer:customers(id,customer_name),technician:installation_technicians(id,full_name),team:installation_teams(id,name),representative:sales_representatives(id,full_name)');
    if(filters.dateFrom)q=q.gte('scheduled_date',filters.dateFrom);
    if(filters.dateTo)q=q.lte('scheduled_date',filters.dateTo);
    if(filters.technicianId)q=q.eq('technician_id',filters.technicianId);
    if(filters.teamId)q=q.eq('installation_team_id',filters.teamId);
    if(filters.representativeId)q=q.eq('representative_id',filters.representativeId);
    if(filters.status)q=q.eq('status',filters.status);
    const [{data:rows,error:re},{data:revisits,error:ve},{data:techs,error:te},{data:teams,error:tme},{data:reps,error:rpe},{data:invoices,error:ie},{data:services,error:se}]=await Promise.all([
      q.order('scheduled_date',{ascending:false,nullsFirst:false}),
      db().from('installation_revisits').select('installation_request_id'),
      db().from('installation_technicians').select('id,full_name').order('full_name'),
      db().from('installation_teams').select('id,name').order('name'),
      db().from('sales_representatives').select('id,full_name').order('full_name'),
      db().from('sales_invoices').select('installation_request_id,invoice_number,invoice_amount,installation_expenses,invoice_date,status').eq('source_type','installation').neq('status','ملغاة'),
      db().from('installation_request_services').select('installation_request_id,quantity,line_total,service:installation_service_types(default_cost)')
    ]);
    if(re)throw new Error('تعذر تحميل تقرير المواعيد: '+re.message);
    if(ve)throw new Error('تعذر تحميل بيانات إعادة الزيارة: '+ve.message);
    if(te||tme||rpe)throw new Error('تعذر تحميل قوائم تصفية تقارير المواعيد.');
    if(ie)throw new Error('تعذر تحميل القيم المالية للفواتير: '+ie.message);
    if(se)throw new Error('تعذر تحميل تكاليف خدمات المواعيد: '+se.message);
    const revisitCount=new Map();(revisits||[]).forEach(v=>revisitCount.set(v.installation_request_id,(revisitCount.get(v.installation_request_id)||0)+1));
    const invoiceMap=new Map();(invoices||[]).forEach(x=>invoiceMap.set(x.installation_request_id,x));
    const serviceAmount=new Map(),serviceCost=new Map(),serviceQuantity=new Map();(services||[]).forEach(x=>{serviceAmount.set(x.installation_request_id,(serviceAmount.get(x.installation_request_id)||0)+Number(x.line_total||0));serviceCost.set(x.installation_request_id,(serviceCost.get(x.installation_request_id)||0)+Number(x.quantity||0)*Number(x.service?.default_cost||0));serviceQuantity.set(x.installation_request_id,(serviceQuantity.get(x.installation_request_id)||0)+Number(x.quantity||0));});
    const normalized=(rows||[]).map(r=>{const inv=invoiceMap.get(r.id);const revenue=Number(inv?.invoice_amount??r.final_amount??(Number(r.total_services_amount||0)+Number(r.tax_amount||0)-Number(r.discount_amount||0))??serviceAmount.get(r.id)??0);const expenses=Number(inv?.installation_expenses??serviceCost.get(r.id)??0);const profit=revenue-expenses;const duration=r.started_at&&r.completed_at?(new Date(r.completed_at)-new Date(r.started_at))/60000:null;return {id:r.id,requestNumber:r.request_number,customerName:r.customer?.customer_name||'',representativeId:r.representative_id||'',representativeName:r.representative?.full_name||'غير محدد',teamId:r.installation_team_id||'',teamName:r.team?.name||'غير مسند',technicianId:r.technician_id||'',technicianName:r.assigned_technician_name||r.technician?.full_name||'غير مسند',status:r.status||'',scheduledDate:r.scheduled_date||'',failureReason:r.execution_failure_reason||'',startedAt:r.started_at||'',completedAt:r.completed_at||'',durationMinutes:Number.isFinite(duration)&&duration>=0?duration:null,revisitCount:revisitCount.get(r.id)||0,invoiceNumber:inv?.invoice_number||'',invoiceDate:inv?.invoice_date||'',invoiceStatus:inv?.status||'',isInvoiced:Boolean(inv),revenue,expenses,profit,margin:revenue?profit/revenue*100:0,requestedQuantity:Number(serviceQuantity.get(r.id)||0),executedQuantity:(r.status==='مكتمل'||Boolean(inv))?Number(serviceQuantity.get(r.id)||0):0,remainingQuantity:(r.status==='مكتمل'||Boolean(inv))?0:Number(serviceQuantity.get(r.id)||0),executionRate:(r.status==='مكتمل'||Boolean(inv))?100:0};});
    const sum=(arr,key)=>arr.reduce((a,x)=>a+Number(x[key]||0),0),avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):null;
    const total=normalized.length,completed=normalized.filter(r=>r.status==='مكتمل'||r.isInvoiced).length,revisitTotal=normalized.filter(r=>r.revisitCount>0).length,revenue=sum(normalized,'revenue'),expenses=sum(normalized,'expenses'),profit=revenue-expenses;
    const durations=normalized.map(r=>r.durationMinutes).filter(Number.isFinite);
    const summary={total,completed,revenue,expenses,profit,margin:revenue?Math.round(profit/revenue*1000)/10:0,completionRate:total?Math.round(completed/total*100):0,revisitRate:total?Math.round(revisitTotal/total*100):0,averageDurationMinutes:avg(durations)};
    function aggregate(keyName,labelName){const map=new Map();normalized.forEach(r=>{const key=r[keyName]||'none',x=map.get(key)||{id:key,name:r[labelName]||'غير محدد',total:0,completed:0,exceptions:0,revisits:0,revenue:0,expenses:0,profit:0,durations:[]};x.total++;if(r.status==='مكتمل'||r.isInvoiced)x.completed++;if(['مؤجل','متعذر'].includes(r.status))x.exceptions++;if(r.revisitCount)x.revisits+=r.revisitCount;x.revenue+=r.revenue;x.expenses+=r.expenses;x.profit+=r.profit;if(Number.isFinite(r.durationMinutes))x.durations.push(r.durationMinutes);map.set(key,x)});return [...map.values()].map(x=>({...x,averageDurationMinutes:avg(x.durations),completionRate:x.total?Math.round(x.completed/x.total*100):0,averageOrderValue:x.total?x.revenue/x.total:0})).sort((a,b)=>b.profit-a.profit)}
    const reasonMap=new Map();normalized.filter(r=>r.failureReason).forEach(r=>reasonMap.set(r.failureReason,(reasonMap.get(r.failureReason)||0)+1));
    return {summary,rows:normalized,byRepresentative:aggregate('representativeId','representativeName'),byTeam:aggregate('teamId','teamName'),byTechnician:aggregate('technicianId','technicianName'),failureReasons:[...reasonMap.entries()].map(([reason,count])=>({reason,count})).sort((a,b)=>b.count-a.count),technicians:(techs||[]).map(t=>({id:t.id,name:t.full_name})),teams:(teams||[]).map(t=>({id:t.id,name:t.name})),representatives:(reps||[]).map(r=>({id:r.id,name:r.full_name}))};
  }


  async function installationSummaryReport(filters={}){
    requireAction('view','installationReports');
    const selectedTeams=Array.isArray(filters.teamIds)?new Set(filters.teamIds.filter(Boolean).map(String)):new Set(),teamFilterApplied=filters.teamFilterApplied===true;
    const visitSelect='id,installation_request_id,visit_no,scheduled_date,scheduled_time,installation_team_id,technician_name,status,selected_for_execution_at,on_route_at,map_opened_at,arrived_at,started_at,collection_at,completed_at,execution_notes,team:installation_teams(id,name),request:installation_requests(id,request_number,representative_id,neighborhood_id,status,scheduled_date,scheduled_time,assigned_technician_name,total_services_amount,tax_amount,discount_amount,final_amount,customer:customers(id,customer_name,phone),representative:sales_representatives(id,full_name))';
    const requestSelect='id,request_number,neighborhood_id,scheduled_date,scheduled_time,installation_team_id,assigned_technician_name,representative_id,status,total_services_amount,tax_amount,discount_amount,final_amount,on_route_at,map_opened_at,arrived_at,started_at,collection_at,completed_at,customer:customers(id,customer_name,phone),team:installation_teams(id,name),representative:sales_representatives(id,full_name)';
    const applyDateFilter=q=>{if(filters.date)return q.eq('scheduled_date',filters.date);if(filters.dateFrom)q=q.gte('scheduled_date',filters.dateFrom);if(filters.dateTo)q=q.lte('scheduled_date',filters.dateTo);return q};
    const fetchPaged=async(table,select)=>{const out=[],pageSize=1000;for(let from=0;;from+=pageSize){let q=applyDateFilter(db().from(table).select(select)).order('scheduled_date',{ascending:true}).range(from,from+pageSize-1);const {data,error}=await q;if(error)return {data:out,error};const page=data||[];out.push(...page);if(page.length<pageSize)break}return {data:out,error:null}};
    const auditDateFilter=q=>{
      if(filters.date){const d=new Date(`${filters.date}T00:00:00`),n=new Date(d);n.setDate(n.getDate()+1);return q.gte('occurred_at',d.toISOString()).lt('occurred_at',n.toISOString())}
      if(filters.dateFrom)q=q.gte('occurred_at',`${filters.dateFrom}T00:00:00`);
      if(filters.dateTo){const d=new Date(`${filters.dateTo}T00:00:00`);d.setDate(d.getDate()+1);q=q.lt('occurred_at',d.toISOString())}
      return q
    };
    const [{data:visits,error:ve},{data:scheduledRequests,error:sre},{data:teams,error:te},{data:reps,error:re},{data:rescheduleEvents,error:rseAudit}]=await Promise.all([
      fetchPaged('installation_execution_visits',visitSelect),
      fetchPaged('installation_requests',requestSelect),
      db().from('installation_teams').select('id,name').order('name'),
      db().from('sales_representatives').select('id,full_name').order('full_name'),
      auditDateFilter(db().from('installation_reschedule_events').select('id,installation_request_id,execution_visit_id,occurred_at,reason,execution_stage,previous_status,previous_scheduled_date,previous_scheduled_time,previous_team_id,previous_team_name,previous_groomer_name,previous_driver_name,request_number,customer_name,performed_by_name,previous_representative_id')).order('occurred_at',{ascending:false})
    ]);
    if(ve)throw new Error('تعذر تحميل زيارات ملخص المواعيد: '+ve.message);
    if(sre)throw new Error('تعذر تحميل الطلبات المجدولة لملخص المواعيد: '+sre.message);
    if(rseAudit)throw new Error('تعذر تحميل سجل إعادة الجدولة اليومي: '+rseAudit.message);
    if(te||re)throw new Error('تعذر تحميل فلاتر ملخص المواعيد.');
    const inScope=(row,representativeId,teamId)=>(!filters.representativeId||String(representativeId||'')===String(filters.representativeId))&&(!teamFilterApplied||selectedTeams.has(String(teamId||'')));
    // P5.13.8.7: operational appointment reports must be built from the canonical LIVE visit set.
    // Historical cancelled/replaced visits remain in the database for audit/reschedule history, but they
    // must never occupy a current appointment slot, inflate visit/service totals, or render an execution row.
    const operationalVisitStatuses=new Set(['مجدولة','قيد التنفيذ','بانتظار التأكيد','مؤكدة']);
    const cancelledRequestStatuses=new Set(['ملغي','ملغاة']);
    const scopedVisits=(visits||[]).filter(v=>operationalVisitStatuses.has(String(v.status||'').trim())&&inScope(v,v.request?.representative_id,v.installation_team_id));
    const scopedRequests=(scheduledRequests||[]).filter(r=>!cancelledRequestStatuses.has(String(r.status||'').trim())&&inScope(r,r.representative_id,r.installation_team_id));
    const scopedRescheduleEvents=(rescheduleEvents||[]).filter(e=>inScope(e,e.previous_representative_id,e.previous_team_id)).map(e=>({
      id:e.id,requestId:e.installation_request_id||'',visitId:e.execution_visit_id||'',occurredAt:e.occurred_at||'',
      reason:e.reason||'',stage:e.execution_stage||'غير محدد',previousStatus:e.previous_status||'',
      previousScheduledDate:e.previous_scheduled_date||'',previousScheduledTime:String(e.previous_scheduled_time||'').slice(0,5),
      teamId:e.previous_team_id||'',teamName:e.previous_team_name||'غير مسند',
      groomerName:e.previous_groomer_name||'غير محدد',driverName:e.previous_driver_name||'غير محدد',
      requestNumber:e.request_number||'',customerName:e.customer_name||'',performedBy:e.performed_by_name||''
    }));

    // A request scheduled through the multi-day workflow must be represented by its visit rows only.
    // Check all candidate single-day request IDs for any execution visit, not only visits on the selected date,
    // so the request row can never double-count a multi-day schedule.
    const candidateRequestIds=[...new Set(scopedRequests.map(r=>r.id).filter(Boolean))];
    let requestsWithVisits=new Set();
    if(candidateRequestIds.length){
      const {data:anyVisits,error:ave}=await db().from('installation_execution_visits').select('installation_request_id').in('installation_request_id',candidateRequestIds).in('status',[...operationalVisitStatuses]);
      if(ave)throw new Error('تعذر التحقق من نوع جدولة طلبات ملخص المواعيد: '+ave.message);
      requestsWithVisits=new Set((anyVisits||[]).map(v=>String(v.installation_request_id||'')).filter(Boolean));
    }
    const singleDayRequests=scopedRequests.filter(r=>!requestsWithVisits.has(String(r.id||'')));
    if(!scopedVisits.length&&!singleDayRequests.length)return {rows:[],executionGroups:[],rescheduleEvents:scopedRescheduleEvents,summary:{teams:0,visits:0,quantity:0,value:0,expenses:0,profit:0,average:0},teams:(teams||[]).map(x=>({id:x.id,name:x.name})),representatives:(reps||[]).map(x=>({id:x.id,name:x.full_name}))};

    const visitIds=scopedVisits.map(v=>v.id).filter(Boolean);
    const requestIds=[...new Set([...scopedVisits.map(v=>v.installation_request_id),...singleDayRequests.map(r=>r.id)].filter(Boolean))];
    const visitLinesResult=visitIds.length?await db().from('installation_execution_visit_services').select('visit_id,request_service_id,scheduled_quantity').in('visit_id',visitIds):{data:[],error:null};
    const requestServicesResult=requestIds.length?await db().from('installation_request_services').select('id,installation_request_id,quantity,unit_price,line_total,service:installation_service_types(id,name,default_price,default_cost)').in('installation_request_id',requestIds):{data:[],error:null};
    const collectionsResult=requestIds.length?await db().from('installation_request_collection').select('installation_request_id,amount_collected,collection_status,payment_method,collected_at').in('installation_request_id',requestIds):{data:[],error:null};
    const {data:visitLines,error:vle}=visitLinesResult,{data:requestServices,error:rse}=requestServicesResult,{data:collections,error:ce}=collectionsResult;
    if(vle)throw new Error('تعذر تحميل كميات خدمات الزيارات: '+vle.message);
    if(rse)throw new Error('تعذر تحميل خدمات المواعيد: '+rse.message);
    if(ce)throw new Error('تعذر تحميل بيانات التحصيل لملخص المواعيد: '+ce.message);
    const neighborhoodIds=[...new Set([...scopedVisits.map(v=>v.request?.neighborhood_id),...singleDayRequests.map(r=>r.neighborhood_id)].filter(Boolean))];
    const neighborhoodsResult=neighborhoodIds.length?await db().from('installation_neighborhoods').select('id,name,city_id,region_id,city,region').in('id',neighborhoodIds):{data:[],error:null};
    if(neighborhoodsResult.error)throw new Error('تعذر تحميل البيانات الجغرافية لملخص المواعيد: '+neighborhoodsResult.error.message);
    const geoMap=new Map((neighborhoodsResult.data||[]).map(n=>[String(n.id),{neighborhoodId:n.id,neighborhoodName:n.name||'',cityId:n.city_id||'',cityName:n.city||'',regionId:n.region_id||'',regionName:n.region||''}]));

    const visitMap=new Map(scopedVisits.map(v=>[v.id,v])),serviceMap=new Map((requestServices||[]).map(x=>[x.id,x])),collectionMap=new Map((collections||[]).map(x=>[String(x.installation_request_id||''),x])),servicesByRequest=new Map(),grouped=new Map();
    for(const service of requestServices||[]){const key=String(service.installation_request_id||'');const list=servicesByRequest.get(key)||[];list.push(service);servicesByRequest.set(key,list)}
    const addLine=(teamId,teamName,entryKey,serviceName,quantity,unitPrice,unitCost)=>{
      quantity=Number(quantity||0);unitPrice=Number(unitPrice||0);unitCost=Number(unitCost||0);if(quantity<=0)return;
      const value=quantity*unitPrice*1.15,expenses=quantity*unitCost,profit=value-expenses;
      teamId=String(teamId||'unassigned');teamName=teamName||'غير مسند';serviceName=serviceName||'خدمة غير محددة';
      let team=grouped.get(teamId);if(!team){team={id:teamId,name:teamName,visitIds:new Set(),services:new Map(),quantity:0,value:0,expenses:0,profit:0};grouped.set(teamId,team)}
      team.visitIds.add(entryKey);team.quantity+=quantity;team.value+=value;team.expenses+=expenses;team.profit+=profit;
      let item=team.services.get(serviceName);if(!item){item={name:serviceName,entryKeys:new Set(),quantity:0,value:0,expenses:0,profit:0};team.services.set(serviceName,item)}item.entryKeys.add(entryKey);item.quantity+=quantity;item.value+=value;item.expenses+=expenses;item.profit+=profit;
    };

    // Multi-day schedules: use the quantity allocated to each execution visit.
    for(const line of visitLines||[]){
      const visit=visitMap.get(line.visit_id),service=serviceMap.get(line.request_service_id);if(!visit||!service)continue;
      const unitPrice=Number(service.unit_price??service.service?.default_price??(Number(service.quantity||0)?Number(service.line_total||0)/Number(service.quantity||1):0));
      addLine(visit.installation_team_id,visit.team?.name,'visit:'+visit.id,service.service?.name,Number(line.scheduled_quantity||0),unitPrice,Number(service.service?.default_cost||0));
    }

    // Single-day schedules: there is no execution-visit row, so use the request's scheduled date/team
    // and the original request-service quantity/value as the reporting source.
    for(const request of singleDayRequests){
      for(const service of servicesByRequest.get(String(request.id||''))||[]){
        const quantity=Number(service.quantity||0);
        const unitPrice=Number(service.unit_price??service.service?.default_price??(quantity?Number(service.line_total||0)/quantity:0));
        addLine(request.installation_team_id,request.team?.name,'request:'+request.id,service.service?.name,quantity,unitPrice,Number(service.service?.default_cost||0));
      }
    }

    const rows=[...grouped.values()].map(team=>({id:team.id,name:team.name,visits:team.visitIds.size,quantity:team.quantity,value:team.value,expenses:team.expenses,profit:team.profit,average:team.quantity?team.value/team.quantity:0,services:[...team.services.values()].map(x=>({name:x.name,executions:x.entryKeys.size,quantity:x.quantity,value:x.value,expenses:x.expenses,profit:x.profit,average:x.quantity?x.value/x.quantity:0})).sort((a,b)=>b.value-a.value)})).sort((a,b)=>b.value-a.value);
    const executionGrouped=new Map();
    const pushExecution=(teamId,teamName,entryKey,request,scheduledDate,scheduledTime,technicianName,services,executionState=null)=>{
      teamId=String(teamId||'unassigned');teamName=teamName||'غير مسند';
      const normalizedServices=(services||[]).filter(x=>Number(x.quantity||0)>0).map(x=>({name:x.name||'خدمة غير محددة',quantity:Number(x.quantity||0),value:Number(x.value||0),expenses:Number(x.expenses||0),profit:Number(x.profit||0)}));
      const value=normalizedServices.reduce((a,x)=>a+x.value,0),expenses=normalizedServices.reduce((a,x)=>a+x.expenses,0);
      const geo=geoMap.get(String(request?.neighborhood_id||''))||{};
      const state=executionState||request||{},collection=collectionMap.get(String(request?.id||''))||{};const visitNo=Number(state.visit_no||0);const item={entryKey,requestId:request?.id||'',requestNumber:request?.request_number||'',executionNumber:visitNo?`${request?.request_number||''}-${String(visitNo).padStart(2,'0')}`:(request?.request_number||''),visitId:state.id&&entryKey.startsWith('visit:')?state.id:'',visitNo,customerName:request?.customer?.customer_name||'',customerPhone:request?.customer?.phone||'',representativeName:request?.representative?.full_name||'',teamId,teamName,technicianName:technicianName||request?.assigned_technician_name||'',scheduledDate:scheduledDate||request?.scheduled_date||'',scheduledTime:String(scheduledTime||request?.scheduled_time||'').slice(0,5),status:state.completed_at?'مكتمل':(state.started_at?'قيد التنفيذ':(state.arrived_at?'وصل إلى العميل':(state.on_route_at?'في الطريق':(state.status==='بانتظار التأكيد'?'مكتمل':'مسند')))),neighborhoodId:geo.neighborhoodId||'',neighborhoodName:geo.neighborhoodName||'',cityId:geo.cityId||'',cityName:geo.cityName||'',regionId:geo.regionId||'',regionName:geo.regionName||'',services:normalizedServices,value,expenses,profit:value-expenses,requestFinalAmount:Number(request?.final_amount||0),requestTaxAmount:Number(request?.tax_amount||0),requestDiscountAmount:Number(request?.discount_amount||0),amountCollected:Number(collection.amount_collected||0),paymentMethod:collection.payment_method||'',collectionStatus:collection.collection_status||'',collectedAt:collection.collected_at||'',onRouteAt:state.on_route_at||'',mapOpenedAt:state.map_opened_at||'',arrivedAt:state.arrived_at||'',startedAt:state.started_at||'',collectionAt:state.collection_at||'',completedAt:state.completed_at||''};
      let group=executionGrouped.get(teamId);if(!group){group={id:teamId,name:teamName,orders:[]};executionGrouped.set(teamId,group)}group.orders.push(item);
    };
    for(const visit of scopedVisits){
      const serviceLines=[];
      for(const line of visitLines||[]){if(String(line.visit_id)!==String(visit.id))continue;const service=serviceMap.get(line.request_service_id);if(!service)continue;const quantity=Number(line.scheduled_quantity||0);if(quantity<=0)continue;const unitPrice=Number(service.unit_price??service.service?.default_price??(Number(service.quantity||0)?Number(service.line_total||0)/Number(service.quantity||1):0)),unitCost=Number(service.service?.default_cost||0);serviceLines.push({name:service.service?.name,quantity,value:quantity*unitPrice*1.15,expenses:quantity*unitCost,profit:(quantity*unitPrice*1.15)-(quantity*unitCost)})}
      pushExecution(visit.installation_team_id,visit.team?.name,'visit:'+visit.id,visit.request,visit.scheduled_date,visit.scheduled_time,visit.technician_name,serviceLines,visit);
    }
    for(const request of singleDayRequests){
      const serviceLines=(servicesByRequest.get(String(request.id||''))||[]).map(service=>{const quantity=Number(service.quantity||0),unitPrice=Number(service.unit_price??service.service?.default_price??(quantity?Number(service.line_total||0)/quantity:0)),unitCost=Number(service.service?.default_cost||0);return {name:service.service?.name,quantity,value:quantity*unitPrice*1.15,expenses:quantity*unitCost,profit:(quantity*unitPrice*1.15)-(quantity*unitCost)}});
      pushExecution(request.installation_team_id,request.team?.name,'request:'+request.id,request,request.scheduled_date,request.scheduled_time,request.assigned_technician_name,serviceLines);
    }
    const executionGroups=[...executionGrouped.values()].map(group=>({...group,orders:group.orders.sort((a,b)=>String(a.scheduledTime||'').localeCompare(String(b.scheduledTime||''))||String(a.requestNumber||'').localeCompare(String(b.requestNumber||''),'ar'))})).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
    const totalQuantity=rows.reduce((a,x)=>a+x.quantity,0),totalValue=rows.reduce((a,x)=>a+x.value,0),totalExpenses=rows.reduce((a,x)=>a+x.expenses,0),totalProfit=totalValue-totalExpenses;
    return {rows,executionGroups,rescheduleEvents:scopedRescheduleEvents,summary:{teams:rows.length,visits:scopedVisits.length+singleDayRequests.length,quantity:totalQuantity,value:totalValue,expenses:totalExpenses,profit:totalProfit,average:totalQuantity?totalValue/totalQuantity:0},teams:(teams||[]).map(x=>({id:x.id,name:x.name})),representatives:(reps||[]).map(x=>({id:x.id,name:x.full_name}))};
  }

  async function settingsCatalog(){requireAction('view','installationSettings');const [services,teams,neighborhoods,regions,cities,breeds]=await Promise.all([db().from('installation_service_types').select('*').order('name'),db().from('installation_teams').select('*').order('name'),db().from('installation_neighborhoods').select('*').order('name'),db().from('installation_regions').select('id,name,is_active').order('name'),db().from('installation_cities').select('id,region_id,name,is_active').order('name'),db().from('appointment_pet_breeds').select('*').order('pet_type').order('name')]);if(services.error)throw new Error('تعذر تحميل الخدمات: '+services.error.message);if(teams.error)throw new Error('تعذر تحميل فرق المواعيد: '+teams.error.message);if(neighborhoods.error)throw new Error('تعذر تحميل الأحياء: '+neighborhoods.error.message);if(regions.error||cities.error||breeds.error)throw new Error('تعذر تحميل البيانات المرجعية. شغّل Migration المرحلة أولًا.');return {services:services.data||[],teams:teams.data||[],neighborhoods:neighborhoods.data||[],regions:regions.data||[],cities:cities.data||[],breeds:breeds.data||[]}}
  async function saveSettingItem(type,payload){
    requireAction(payload.id?'edit':'add','installationSettings');
    if(type==='neighborhood'){
      if(!payload.regionId)throw new Error('اختر المنطقة من القائمة النشطة.');
      if(!payload.cityId)throw new Error('اختر المدينة التابعة للمنطقة.');
      const [{data:region,error:regionError},{data:city,error:cityError}]=await Promise.all([
        db().from('installation_regions').select('id,name,is_active').eq('id',payload.regionId).eq('is_active',true).maybeSingle(),
        db().from('installation_cities').select('id,region_id,name,is_active').eq('id',payload.cityId).eq('is_active',true).maybeSingle()
      ]);
      if(regionError||!region)throw new Error('المنطقة المختارة غير متاحة أو غير نشطة.');
      if(cityError||!city)throw new Error('المدينة المختارة غير متاحة أو غير نشطة.');
      if(String(city.region_id)!==String(region.id))throw new Error('المدينة المختارة لا تتبع المنطقة المحددة.');
      payload.region=region.name||'';
      payload.city=city.name||'';
    }
    const map={breed:{table:'appointment_pet_breeds',record:{name:String(payload.name||'').trim(),pet_type:payload.petType,is_active:payload.isActive!==false}},service:{table:'installation_service_types',record:{service_code:String(payload.serviceCode||'').trim(),name:payload.name,default_price:Number(payload.price||0),default_cost:Number(payload.cost||0),is_active:payload.isActive!==false}},team:{table:'installation_teams',record:{name:payload.name,leader_name:payload.leaderName||null,phone:payload.phone||null,city:payload.city||null,status:payload.status||'متاحة'}},neighborhood:{table:'installation_neighborhoods',record:{name:payload.name,city:payload.city||null,region:payload.region||null,city_id:payload.cityId||null,region_id:payload.regionId||null,is_active:payload.isActive!==false}}};
    const cfg=map[type];if(!cfg)throw new Error('نوع بيانات غير مدعوم.');
    let q=payload.id?db().from(cfg.table).update(cfg.record).eq('id',payload.id):db().from(cfg.table).insert(cfg.record);
    const {error}=await q;if(error){if(type==='service'&&error.code==='23505')throw new Error('كود الخدمة مستخدم بالفعل. استخدم كودًا مختلفًا.');if(type==='service'&&/service_code/i.test(error.message||''))throw new Error('شغّل Migration كود الخدمات أولًا ثم أعد المحاولة.');throw new Error('تعذر حفظ البيانات: '+error.message)}
  }
  async function toggleSettingItem(type,id,isActive){requireAction('edit','installationSettings');const table=type==='service'?'installation_service_types':type==='neighborhood'?'installation_neighborhoods':type==='breed'?'appointment_pet_breeds':'installation_teams';const record=type==='team'?{status:isActive?'متاحة':'غير نشطة'}:{is_active:!!isActive};const {error}=await db().from(table).update(record).eq('id',id);if(error)throw new Error('تعذر تحديث الحالة: '+error.message)}
  async function removeSettingItem(type,id){requireAction('delete','installationSettings');const table=type==='service'?'installation_service_types':type==='neighborhood'?'installation_neighborhoods':type==='breed'?'appointment_pet_breeds':'installation_teams';const {error}=await db().from(table).delete().eq('id',id);if(error)throw new Error('تعذر حذف البيانات؛ قد تكون مرتبطة بطلبات قائمة. '+error.message)}

  function subscribeExecutionWorkspace(handler){
    const channel=db().channel('petatoe-execution-workspace-updates')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'installation_requests'},handler)
      .on('postgres_changes',{event:'*',schema:'public',table:'installation_execution_visits'},handler)
      .on('postgres_changes',{event:'*',schema:'public',table:'installation_execution_visit_services'},handler)
      .subscribe();
    return ()=>{try{db().removeChannel(channel)}catch(_){ }};
  }

  async function getSettings(){requireAction('view','installationSettings');const {data,error}=await db().from('installation_settings').select('*').eq('id',1).maybeSingle();if(error)throw new Error('تعذر تحميل إعدادات المواعيد: '+error.message);const r=data||{};return {morningLabel:r.morning_label||'صباحية',eveningLabel:r.evening_label||'مسائية',slaDays:Number(r.sla_days??1),defaultPriority:r.default_priority||'عادية',requireCompletionReport:r.require_completion_report!==false}}
  async function saveSettings(payload){requireAction('edit','installationSettings');const record={id:1,morning_label:payload.morningLabel,evening_label:payload.eveningLabel,sla_days:payload.slaDays,default_priority:payload.defaultPriority,require_completion_report:!!payload.requireCompletionReport,updated_at:new Date().toISOString()};const {error}=await db().from('installation_settings').upsert(record,{onConflict:'id'});if(error)throw new Error('تعذر حفظ إعدادات المواعيد: '+error.message)}
  window.InstallationsService={list,options,customerAppointmentDefaults,saveCustomerLocationDefaults,requestEditDetail,requestEditOptions,createRequest,updateRequest,updateRequestServices,updateRequestContextServices,save,remove,technicians,scheduleTeams,technicianNameSuggestions,scheduleList,schedulePlan,assignMultiDay,cancelSchedule,scheduleDayLocks,setScheduleDayLock,technicianBookedTimes,assign,saveTechnician,removeTechnician,executionWorkspace,executionIdentity,selectExecutionRequest,recordMapOpened,returnExecutionToSchedule,completeCollectionStage,advanceExecution,subscribeExecutionWorkspace,completionList,completionQuantitySummary,saveCompletionWorkspace,confirmActualQuantities,cancelConfirmedQuantity,saveCompletion,signedFileUrl,exceptionList,saveRevisit,operationalReport,installationSummaryReport,getSettings,saveSettings,settingsCatalog,saveSettingItem,toggleSettingItem,removeSettingItem};
  window.dispatchEvent(new CustomEvent('kyum-installations-service-ready'));
})();
