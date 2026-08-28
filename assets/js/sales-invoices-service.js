(()=>{
  "use strict";

  const CACHE_PREFIX="sales-invoices:v1:";
  const CACHE_TTL_MS=10*60*1000;
  const CACHE_STALE_MAX_MS=180*24*60*60*1000;
  const CACHE_SCHEMA_VERSION=1;
  const activeContexts=new Map();
  const refreshes=new Map();
  const readStatus={};

  const t=(key,fallback,vars={})=>{const value=window.PetatoeLocalization?.t?.(key,vars);return value&&!/^\[.+\]$/.test(value)?value:fallback};
  const db=()=>{if(!window.customerSupabase)throw new Error("اتصال Supabase غير جاهز.");return window.customerSupabase};
  const requireAction=(action)=>{if(!window.CustomerPermissions?.requireAction?.("salesInvoices",action,{silent:true}))throw new Error("ليس لديك صلاحية تنفيذ هذا الإجراء على فواتير المبيعات.")};
  const ensureOnline=()=>{if(navigator.onLine===false)throw new Error(t("payroll.error.onlineRequired","هذه العملية تحتاج اتصالًا بالإنترنت."))};
  const normalize=r=>{const invoiceAmount=Number(r.invoice_amount||0),finalAmount=r.final_amount==null?null:Number(r.final_amount||0);return {id:r.id,requestNumber:r.request_number||"—",customerId:r.customer?.id||r.customer_id||"",customerName:r.customer?.customer_name||"—",invoiceNumber:r.is_without_invoice?"بدون فاتورة":(r.invoice_number||""),storedInvoiceNumber:r.invoice_number||"",isWithoutInvoice:Boolean(r.is_without_invoice),invoiceAmount,invoiceAmountInclTax:finalAmount==null?Math.round(invoiceAmount*1.15):finalAmount,installationExpenses:Number(r.installation_expenses||0),representativeId:r.representative_id||r.representative?.id||null,representativeName:r.representative?.full_name||"—",invoiceDate:r.invoice_date||"",sourceType:r.source_type||"quotation",status:r.status||"صادرة",quotationId:r.quotation_id||"",installationRequestId:r.installation_request_id||"",installationExecutionVisitId:r.installation_execution_visit_id||"",paymentMethod:r.payment_method||"",referenceInvoiceId:r.reference_sales_invoice_id||"",referenceInvoice:r.reference_invoice?{id:r.reference_invoice.id||"",requestNumber:r.reference_invoice.request_number||"",invoiceNumber:r.reference_invoice.is_without_invoice?"بدون فاتورة":(r.reference_invoice.invoice_number||""),invoiceDate:r.reference_invoice.invoice_date||""}:null,attachments:Array.isArray(r.attachments)?r.attachments:[]}};

  async function namespace(){
    const localId=window.KYUMOfflineSessionStore?.currentUserId?.();
    if(localId)return `user:${localId}`;
    const auth=window.CustomerAuth?.getState?.()||{};
    const stateId=auth?.user?.id||auth?.profile?.id;
    if(stateId)return `user:${stateId}`;
    if(navigator.onLine!==false){
      try{const result=await db().auth?.getUser?.();const id=result?.data?.user?.id;if(id)return `user:${id}`;}catch(_){}
    }
    throw new Error(t("payroll.error.onlineRequired","هذه العملية تحتاج اتصالًا بالإنترنت."));
  }

  function permissionFingerprint(action){
    const auth=window.CustomerAuth?.getState?.()||{};
    const role=String(auth?.profile?.role||window.CustomerPermissions?.currentRole?.()||"viewer");
    const allowed=Boolean(window.PermissionEngine?.can?.("salesInvoices",action)??window.CustomerPermissions?.canAction?.("salesInvoices",action));
    const payload={role,screen:"salesInvoices",action:String(action||"view"),allowed};
    return window.KYUMSmartCache?.hashValue?.(payload)||`role-${encodeURIComponent(role)}-${action}-${allowed?1:0}`;
  }

  async function resolveScope(){
    const profile=window.CustomerAuth?.getState?.().profile||null;
    if(profile?.role==="super_admin")return {mode:"all",representativeIds:[]};
    if(window.KYUMDataAccessScope?.resolve){
      try{return await window.KYUMDataAccessScope.resolve({domain:"customers"});}catch(_){}
    }
    const userId=window.KYUMOfflineSessionStore?.currentUserId?.()||profile?.id||null;
    const cached=userId?window.KYUMOfflineSessionStore?.loadScope?.(userId,"customers"):null;
    if(window.KYUMDataAccessScope?.normalize)return window.KYUMDataAccessScope.normalize(cached||{mode:"none",representativeIds:[]},profile);
    return cached||{mode:"none",representativeIds:[]};
  }

  function scopeFingerprint(scope){
    const ids=Array.isArray(scope?.representativeIds)?[...scope.representativeIds].filter(Boolean).sort():[];
    const payload={mode:String(scope?.mode||"none"),representativeIds:ids};
    return window.KYUMSmartCache?.hashValue?.(payload)||`${payload.mode}:${ids.join(",")}`;
  }

  function token(parts=[]){return (parts||[]).map(value=>encodeURIComponent(String(value??"").trim()||"*")).join("|")}

  async function makeContext(kind,action,parts=[]){
    requireAction(action);
    const ns=await namespace();
    const scope=await resolveScope();
    const permissionHash=permissionFingerprint(action);
    const scopeHash=scopeFingerprint(scope);
    const contextToken=token(parts);
    return {kind,action,namespace:ns,scope,permissionHash,scopeHash,contextToken,key:`${CACHE_PREFIX}${permissionHash}:${scopeHash}:${kind}:${contextToken}`};
  }

  function setReadStatus(kind,source,metadata=null,stale=false){
    readStatus[kind]={source,stale:Boolean(stale),metadata:metadata||null,updatedAt:Number(metadata?.updatedAt||Date.now())};
    return readStatus[kind];
  }

  function emitUpdate(kind,context,data,source){
    window.dispatchEvent?.(new CustomEvent("sales-invoices-data-updated",{detail:{kind,contextKey:context?.key||"",data,source,updatedAt:Date.now()}}));
  }

  async function persist(context,data,source="supabase"){
    if(!window.KYUMSmartCache)return null;
    return window.KYUMSmartCache.set(context.key,data,{namespace:context.namespace,ttlMs:CACHE_TTL_MS,staleMaxMs:CACHE_STALE_MAX_MS,source,schemaVersion:CACHE_SCHEMA_VERSION});
  }

  async function readCached(context){
    if(!window.KYUMSmartCache)return null;
    const hit=await window.KYUMSmartCache.get(context.key,{namespace:context.namespace,allowStale:true,staleMaxMs:CACHE_STALE_MAX_MS});
    return hit?.hit?hit:null;
  }

  async function fetchAndPersist(kind,context,fetcher,{emit=false}={}){
    ensureOnline();
    if(refreshes.has(context.key))return refreshes.get(context.key);
    const operation=(async()=>{
      const data=await fetcher();
      const meta=await persist(context,data,"supabase");
      const active=activeContexts.get(kind);
      if(active?.context?.key===context.key)setReadStatus(kind,"network",{updatedAt:meta?.updatedAt||Date.now(),recordCount:meta?.recordCount??null},false);
      if(emit)emitUpdate(kind,context,data,"network-background");
      return data;
    })();
    refreshes.set(context.key,operation);
    try{return await operation;}finally{refreshes.delete(context.key)}
  }

  async function loadWorkspace({kind,action,parts=[],fetcher,force=false}){
    const context=await makeContext(kind,action,parts);
    activeContexts.set(kind,{context,fetcher,parts:[...parts],action});
    const cached=await readCached(context);
    if(cached&&(!force||navigator.onLine===false)){
      setReadStatus(kind,"cache",cached.metadata||null,Boolean(cached.stale));
      if(navigator.onLine!==false)fetchAndPersist(kind,context,fetcher,{emit:true}).catch(error=>console.warn(`Sales invoices ${kind} background refresh skipped:`,error));
      return cached.data;
    }
    try{return await fetchAndPersist(kind,context,fetcher,{emit:false})}catch(error){
      if(cached){setReadStatus(kind,"cache",cached.metadata||null,Boolean(cached.stale));return cached.data}
      throw error;
    }
  }

  async function invalidateCache(){
    const ns=await namespace().catch(()=>null);
    if(ns&&window.KYUMSmartCache)await window.KYUMSmartCache.removePrefix(CACHE_PREFIX,{namespace:ns});
    Object.keys(readStatus).forEach(key=>delete readStatus[key]);
    activeContexts.clear();
  }

  async function fetchListFromNetwork(){
    ensureOnline();
    const {data,error}=await db().from("sales_invoices").select("id,request_number,customer_id,invoice_number,is_without_invoice,invoice_amount,final_amount,installation_expenses,invoice_date,source_type,status,quotation_id,installation_request_id,installation_execution_visit_id,payment_method,reference_sales_invoice_id,representative_id,customer:customers(id,customer_name),representative:sales_representatives(id,full_name)").order("invoice_date",{ascending:false}).order("created_at",{ascending:false});
    if(error)throw new Error("تعذر تحميل فواتير المبيعات: "+error.message);
    const referenceIds=[...new Set((data||[]).map(x=>x.reference_sales_invoice_id).filter(Boolean))];
    let referenceById=new Map();
    if(referenceIds.length){
      const {data:referenceRows,error:referenceError}=await db().from("sales_invoices").select("id,request_number,invoice_number,is_without_invoice,invoice_date").in("id",referenceIds);
      if(referenceError)throw new Error("تعذر تحميل مراجع الفواتير: "+referenceError.message);
      referenceById=new Map((referenceRows||[]).map(row=>[String(row.id),row]));
    }
    const requestIds=[...new Set((data||[]).map(x=>x.installation_request_id).filter(Boolean))];
    let attachments=[],collections=[];
    if(requestIds.length){
      const [{data:files,error:fe},{data:collectionRows,error:ce}]=await Promise.all([
        db().from("installation_execution_files").select("id,installation_request_id,execution_visit_id,storage_path,original_name,mime_type,file_size,file_kind,uploaded_at").in("installation_request_id",requestIds).order("uploaded_at",{ascending:true}),
        db().from("installation_request_collection").select("installation_request_id,payment_method").in("installation_request_id",requestIds)
      ]);
      if(fe)throw new Error("تعذر تحميل مرفقات التنفيذ: "+fe.message);
      if(ce)throw new Error("تعذر تحميل طريقة دفع الفواتير: "+ce.message);
      attachments=files||[];collections=collectionRows||[];
    }
    const byRequest=new Map();attachments.forEach(f=>{const a=byRequest.get(String(f.installation_request_id))||[];a.push({id:f.id,storagePath:f.storage_path,originalName:f.original_name||"مرفق",mimeType:f.mime_type||"",fileSize:Number(f.file_size||0),fileKind:f.file_kind||"execution",visitId:f.execution_visit_id||"",uploadedAt:f.uploaded_at||""});byRequest.set(String(f.installation_request_id),a)});
    const paymentByRequest=new Map(collections.map(c=>[String(c.installation_request_id),c.payment_method||""]));
    return (data||[]).map(r=>{const all=byRequest.get(String(r.installation_request_id))||[];const rowAttachments=r.installation_execution_visit_id?all.filter(f=>!f.visitId||String(f.visitId)===String(r.installation_execution_visit_id)):all;const referenceInvoice=r.reference_sales_invoice_id?referenceById.get(String(r.reference_sales_invoice_id))||null:null;return normalize({...r,reference_invoice:referenceInvoice,payment_method:r.source_type==="manual"?(r.payment_method||""):(paymentByRequest.get(String(r.installation_request_id))||r.payment_method||""),attachments:rowAttachments})});
  }

  async function list(options={}){
    const force=options===true||Boolean(options?.force);
    return loadWorkspace({kind:"list",action:"view",parts:["registry"],force,fetcher:fetchListFromNetwork});
  }

  async function fetchManualCatalogFromNetwork(){
    ensureOnline();
    const {data,error}=await db().rpc("get_manual_sales_invoice_catalog");
    if(error)throw new Error("تعذر تحميل بيانات الفاتورة اليدوية: "+error.message);
    const value=data&&typeof data==="object"?data:{};
    return {customers:Array.isArray(value.customers)?value.customers:[],services:Array.isArray(value.services)?value.services:[]};
  }

  async function manualCatalog(options={}){
    const force=options===true||Boolean(options?.force);
    return loadWorkspace({kind:"manualCatalog",action:"add",parts:["catalog"],force,fetcher:fetchManualCatalogFromNetwork});
  }

  async function createManual(payload){
    requireAction("add");ensureOnline();
    const invoiceNumber=String(payload?.invoiceNumber||"").trim(),withoutInvoice=Boolean(payload?.withoutInvoice),invoiceDate=String(payload?.invoiceDate||"").trim(),paymentMethod=String(payload?.paymentMethod||"").trim();
    if(!payload?.customerId)throw new Error("اختر العميل.");
    if(!withoutInvoice&&!invoiceNumber)throw new Error("رقم الفاتورة مطلوب أو اختر بدون فاتورة.");
    if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");
    if(!paymentMethod)throw new Error("اختر طريقة الدفع.");
    if(!Array.isArray(payload?.services)||!payload.services.length)throw new Error("أضف خدمة واحدة على الأقل.");
    const services=payload.services.map(x=>({service_type_id:x.serviceTypeId,quantity:Number(x.quantity),unit_price:Number(x.unitPrice)}));
    if(services.some(x=>!x.service_type_id||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unit_price)||x.unit_price<0))throw new Error("راجع نوع الخدمة والعدد والسعر في جميع الخدمات.");
    const {data,error}=await db().rpc("create_manual_sales_invoice",{p_customer_id:payload.customerId,p_invoice_number:withoutInvoice?null:invoiceNumber,p_without_invoice:withoutInvoice,p_invoice_date:invoiceDate,p_payment_method:paymentMethod,p_reference_sales_invoice_id:payload.referenceInvoiceId||null,p_services:services,p_discount_type:payload.discountType==="percentage"?"percentage":"amount",p_discount_value:Number(payload.discountValue||0),p_notes:String(payload.notes||"").trim()||null});
    if(error)throw new Error("تعذر إنشاء الفاتورة اليدوية: "+error.message);
    await invalidateCache();
    return Array.isArray(data)?data[0]:data;
  }

  async function createFromQuotation(payload){
    requireAction("add");ensureOnline();
    const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim();
    if(!invoiceNumber)throw new Error("رقم الفاتورة مطلوب.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");
    const {data,error}=await db().rpc("create_sales_invoice_from_quotation",{p_quotation_id:payload.quotationId,p_invoice_number:invoiceNumber,p_invoice_date:invoiceDate});
    if(error)throw new Error("تعذر تحويل العقد إلى فاتورة: "+error.message);
    await invalidateCache();
    return Array.isArray(data)?data[0]:data;
  }

  async function createFromInstallationVisit(payload){
    requireAction("add");ensureOnline();
    const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim(),withoutInvoice=Boolean(payload?.withoutInvoice);
    if(!payload?.installationRequestId||!payload?.visitId)throw new Error("بيانات زيارة التركيب غير مكتملة.");if(!withoutInvoice&&!invoiceNumber)throw new Error("رقم الفاتورة مطلوب أو اختر بدون فاتورة.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");
    if(window.InstallationsService?.assertFinancialBoundaryReady)await window.InstallationsService.assertFinancialBoundaryReady({requestId:payload.installationRequestId,visitId:payload.visitId,groupVisitIds:payload.groupVisitIds||[]});
    const operationKey=window.InstallationsService?.buildFinancialOperationKey?await window.InstallationsService.buildFinancialOperationKey("visit_invoice",{requestId:payload.installationRequestId,visitId:payload.visitId,groupVisitIds:[...(payload.groupVisitIds||[])].map(String).sort(),invoiceNumber:withoutInvoice?"":invoiceNumber,invoiceDate,withoutInvoice}):`visit-invoice:${payload.installationRequestId}:${payload.visitId}:${invoiceDate}:${withoutInvoice?'without':invoiceNumber}`;
    const {data,error}=await db().rpc("create_sales_invoice_from_installation_visit_safe_v1",{p_installation_request_id:payload.installationRequestId,p_visit_id:payload.visitId,p_invoice_number:withoutInvoice?null:invoiceNumber,p_invoice_date:invoiceDate,p_without_invoice:withoutInvoice,p_operation_key:operationKey});
    if(error)throw new Error("تعذر تحويل الكمية المنفذة إلى فاتورة: "+error.message);
    await invalidateCache();
    return data||{};
  }

  async function fetchEditWorkspaceFromNetwork(invoiceId){
    ensureOnline();
    const {data,error}=await db().rpc("get_sales_invoice_edit_workspace",{p_invoice_id:invoiceId});
    if(error)throw new Error("تعذر تحميل بيانات تعديل الفاتورة: "+error.message);
    const x=data&&typeof data==="object"?data:{};
    return {sourceType:x.sourceType||"",requestId:x.requestId||"",visitId:x.visitId||"",serviceCatalog:Array.isArray(x.serviceCatalog)?x.serviceCatalog:[],services:Array.isArray(x.services)?x.services:[],discount:x.discount&&typeof x.discount==="object"?x.discount:{type:"amount",value:0,amount:0},collection:x.collection&&typeof x.collection==="object"?x.collection:{},attachments:Array.isArray(x.attachments)?x.attachments:[]};
  }

  async function editWorkspace(invoiceId,options={}){
    if(!invoiceId)throw new Error("معرّف الفاتورة مطلوب.");
    const force=options===true||Boolean(options?.force);
    return loadWorkspace({kind:"editWorkspace",action:"edit",parts:["invoice",invoiceId],force,fetcher:()=>fetchEditWorkspaceFromNetwork(invoiceId)});
  }

  async function uploadCollectionAttachment(requestId,visitId,file){
    if(!file)return null;ensureOnline();
    if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("صيغة الصورة غير مدعومة.");
    if(file.size<1||file.size>10485760)throw new Error("حجم الصورة يجب أن يكون بين 1 بايت و10 ميجابايت.");
    const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
    const path=`${requestId}/execution/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucket=db().storage.from("installation-evidence");
    const {error:up}=await bucket.upload(path,file,{contentType:file.type,upsert:false});
    if(up)throw new Error("تعذر رفع مرفق التحصيل: "+up.message);
    const {data:record,error}=await db().from("installation_execution_files").insert({installation_request_id:requestId,storage_path:path,original_name:file.name,mime_type:file.type,file_size:file.size,file_kind:"collection",execution_visit_id:visitId||null}).select("id,storage_path").single();
    if(error){await bucket.remove([path]).catch(()=>{});throw new Error("تعذر تسجيل مرفق التحصيل: "+error.message)}
    return {id:record?.id||null,path};
  }

  async function rollbackUploadedAttachments(files){
    const list=(files||[]).filter(Boolean);if(!list.length)return;
    const ids=list.map(x=>x.id).filter(Boolean),paths=list.map(x=>x.path).filter(Boolean);
    if(ids.length)await db().from("installation_execution_files").delete().in("id",ids).catch(()=>{});
    if(paths.length)await db().storage.from("installation-evidence").remove(paths).catch(()=>{});
  }

  async function updateFullInvoice(payload){
    requireAction("edit");ensureOnline();
    if(!payload?.id)throw new Error("معرّف الفاتورة مطلوب.");
    const invoiceNumber=String(payload.invoiceNumber||"").trim(),invoiceDate=String(payload.invoiceDate||"").trim(),withoutInvoice=Boolean(payload.withoutInvoice),paymentMethod=String(payload.paymentMethod||"").trim(),discountType=payload.discountType==="percentage"?"percentage":"amount",discountValue=Math.max(0,Number(payload.discountValue||0));
    if(!withoutInvoice&&!invoiceNumber)throw new Error("رقم الفاتورة مطلوب أو اختر بدون فاتورة.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");if(!paymentMethod)throw new Error("اختر طريقة الدفع.");if(!Array.isArray(payload.services)||!payload.services.length)throw new Error("أضف خدمة واحدة على الأقل.");
    const services=payload.services.map(x=>({request_service_id:x.requestServiceId||null,service_type_id:x.serviceTypeId,quantity:Number(x.quantity),unit_price:Number(x.unitPrice)}));
    if(services.some(x=>!x.service_type_id||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unit_price)||x.unit_price<0))throw new Error("راجع نوع الخدمة والعدد والسعر في جميع الخدمات.");
    const uploaded=[];
    try{
      if(payload.sourceType==="installation"&&payload.requestId&&Array.isArray(payload.newAttachments)){for(const file of payload.newAttachments)uploaded.push(await uploadCollectionAttachment(payload.requestId,payload.visitId||null,file))}
      const {data,error}=await db().rpc("update_sales_invoice_full_v1",{p_invoice_id:payload.id,p_invoice_number:withoutInvoice?null:invoiceNumber,p_invoice_date:invoiceDate,p_without_invoice:withoutInvoice,p_payment_method:paymentMethod,p_services:services,p_discount_type:discountType,p_discount_value:discountValue,p_collection_notes:String(payload.collectionNotes||"").trim()||null,p_removed_attachment_ids:Array.isArray(payload.removedAttachmentIds)?payload.removedAttachmentIds:[]});
      if(error)throw new Error("تعذر حفظ تعديل الفاتورة: "+error.message);
      const removedPaths=Array.isArray(data?.removedStoragePaths)?data.removedStoragePaths:[];
      if(removedPaths.length)await db().storage.from("installation-evidence").remove(removedPaths).catch(()=>{});
      await invalidateCache();
      return data||{};
    }catch(error){if(uploaded.length)await rollbackUploadedAttachments(uploaded);throw error}
  }

  async function updateInvoice(payload){
    requireAction("edit");ensureOnline();
    const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim(),withoutInvoice=Boolean(payload?.withoutInvoice),paymentMethod=String(payload?.paymentMethod||"").trim();
    if(!payload?.id)throw new Error("معرّف الفاتورة مطلوب.");if(!withoutInvoice&&!invoiceNumber)throw new Error("رقم الفاتورة مطلوب أو اختر بدون فاتورة.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");if(payload?.sourceType==="installation"&&!paymentMethod)throw new Error("طريقة الدفع مطلوبة لفاتورة الموعد.");
    const {data,error}=await db().rpc("update_sales_invoice_registry_v2",{p_invoice_id:payload.id,p_invoice_number:withoutInvoice?null:invoiceNumber,p_invoice_date:invoiceDate,p_without_invoice:withoutInvoice,p_payment_method:payload?.sourceType==="installation"?paymentMethod:null});
    if(error)throw new Error("تعذر تعديل بيانات الفاتورة: "+error.message);
    await invalidateCache();
    return Array.isArray(data)?data[0]:data;
  }

  async function refreshActiveContexts(){
    if(navigator.onLine===false)return;
    const entries=[...activeContexts.entries()];
    for(const [kind,entry] of entries){
      try{
        const next=await makeContext(kind,entry.action,entry.parts);
        if(next.key!==entry.context.key){
          await window.KYUMSmartCache?.remove?.(entry.context.key,{namespace:entry.context.namespace});
          activeContexts.delete(kind);
          continue;
        }
        await fetchAndPersist(kind,next,entry.fetcher,{emit:true});
      }catch(error){console.warn(`Sales invoices ${kind} sync refresh skipped:`,error)}
    }
  }

  if(window.KYUMSyncEngine?.register)window.KYUMSyncEngine.register("sales_invoices_read",()=>refreshActiveContexts());

  window.SalesInvoicesService={
    list,manualCatalog,createManual,createFromQuotation,createFromInstallationVisit,editWorkspace,updateFullInvoice,updateInvoice,
    invalidateCache,
    getReadStatus:kind=>readStatus[kind]||null,
    refreshActiveContexts
  };
})();
