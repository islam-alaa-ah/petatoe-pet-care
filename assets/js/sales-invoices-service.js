(()=>{
  "use strict";
  const db=()=>{if(!window.customerSupabase)throw new Error("اتصال Supabase غير جاهز.");return window.customerSupabase};
  const requireAction=(action)=>{if(!window.CustomerPermissions?.requireAction?.("salesInvoices",action,{silent:true}))throw new Error("ليس لديك صلاحية تنفيذ هذا الإجراء على فواتير المبيعات.")};
  const normalize=r=>{const invoiceAmount=Number(r.invoice_amount||0),finalAmount=r.final_amount==null?null:Number(r.final_amount||0);return {id:r.id,requestNumber:r.request_number||"—",customerId:r.customer?.id||r.customer_id||"",customerName:r.customer?.customer_name||"—",invoiceNumber:r.is_without_invoice?"بدون فاتورة":(r.invoice_number||""),storedInvoiceNumber:r.invoice_number||"",isWithoutInvoice:Boolean(r.is_without_invoice),invoiceAmount,invoiceAmountInclTax:finalAmount==null?Math.round(invoiceAmount*1.15):finalAmount,installationExpenses:Number(r.installation_expenses||0),representativeName:r.representative?.full_name||"—",invoiceDate:r.invoice_date||"",sourceType:r.source_type||"quotation",status:r.status||"صادرة",quotationId:r.quotation_id||"",installationRequestId:r.installation_request_id||"",installationExecutionVisitId:r.installation_execution_visit_id||"",paymentMethod:r.payment_method||"",referenceInvoiceId:r.reference_sales_invoice_id||"",referenceInvoice:r.reference_invoice?{id:r.reference_invoice.id||"",requestNumber:r.reference_invoice.request_number||"",invoiceNumber:r.reference_invoice.is_without_invoice?"بدون فاتورة":(r.reference_invoice.invoice_number||""),invoiceDate:r.reference_invoice.invoice_date||""}:null,attachments:Array.isArray(r.attachments)?r.attachments:[]}};
  async function list(){
    requireAction("view");
    const {data,error}=await db().from("sales_invoices").select("id,request_number,customer_id,invoice_number,is_without_invoice,invoice_amount,final_amount,installation_expenses,invoice_date,source_type,status,quotation_id,installation_request_id,installation_execution_visit_id,payment_method,reference_sales_invoice_id,customer:customers(id,customer_name),representative:sales_representatives(id,full_name),reference_invoice:sales_invoices!sales_invoices_reference_sales_invoice_id_fkey(id,request_number,invoice_number,is_without_invoice,invoice_date)").order("invoice_date",{ascending:false}).order("created_at",{ascending:false});
    if(error)throw new Error("تعذر تحميل فواتير المبيعات: "+error.message);
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
    return (data||[]).map(r=>{const all=byRequest.get(String(r.installation_request_id))||[];const rowAttachments=r.installation_execution_visit_id?all.filter(f=>!f.visitId||String(f.visitId)===String(r.installation_execution_visit_id)):all;return normalize({...r,payment_method:r.source_type==="manual"?(r.payment_method||""):(paymentByRequest.get(String(r.installation_request_id))||r.payment_method||""),attachments:rowAttachments})})
  }
  async function manualCatalog(){
    requireAction("add");
    const {data,error}=await db().rpc("get_manual_sales_invoice_catalog");
    if(error)throw new Error("تعذر تحميل بيانات الفاتورة اليدوية: "+error.message);
    const value=data&&typeof data==="object"?data:{};
    return {customers:Array.isArray(value.customers)?value.customers:[],services:Array.isArray(value.services)?value.services:[]};
  }
  async function createManual(payload){
    requireAction("add");
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
    return Array.isArray(data)?data[0]:data;
  }
  async function createFromQuotation(payload){requireAction("add");const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim();if(!invoiceNumber)throw new Error("رقم الفاتورة مطلوب.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");const {data,error}=await db().rpc("create_sales_invoice_from_quotation",{p_quotation_id:payload.quotationId,p_invoice_number:invoiceNumber,p_invoice_date:invoiceDate});if(error)throw new Error("تعذر تحويل العقد إلى فاتورة: "+error.message);return Array.isArray(data)?data[0]:data}
  async function createFromInstallationVisit(payload){requireAction("add");const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim(),withoutInvoice=Boolean(payload?.withoutInvoice);if(!payload?.installationRequestId||!payload?.visitId)throw new Error("بيانات زيارة التركيب غير مكتملة.");if(!withoutInvoice&&!invoiceNumber)throw new Error("رقم الفاتورة مطلوب أو اختر بدون فاتورة.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");const {data,error}=await db().rpc("create_sales_invoice_from_installation_group_v3",{p_installation_request_id:payload.installationRequestId,p_visit_id:payload.visitId,p_invoice_number:withoutInvoice?null:invoiceNumber,p_invoice_date:invoiceDate,p_without_invoice:withoutInvoice});if(error)throw new Error("تعذر تحويل الكمية المنفذة إلى فاتورة: "+error.message);return Array.isArray(data)?data[0]:data}
  async function updateInvoice(payload){requireAction("edit");const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim(),withoutInvoice=Boolean(payload?.withoutInvoice),paymentMethod=String(payload?.paymentMethod||"").trim();if(!payload?.id)throw new Error("معرّف الفاتورة مطلوب.");if(!withoutInvoice&&!invoiceNumber)throw new Error("رقم الفاتورة مطلوب أو اختر بدون فاتورة.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");if(payload?.sourceType==="installation"&&!paymentMethod)throw new Error("طريقة الدفع مطلوبة لفاتورة الموعد.");const {data,error}=await db().rpc("update_sales_invoice_registry_v2",{p_invoice_id:payload.id,p_invoice_number:withoutInvoice?null:invoiceNumber,p_invoice_date:invoiceDate,p_without_invoice:withoutInvoice,p_payment_method:payload?.sourceType==="installation"?paymentMethod:null});if(error)throw new Error("تعذر تعديل بيانات الفاتورة: "+error.message);return Array.isArray(data)?data[0]:data}
  window.SalesInvoicesService={list,manualCatalog,createManual,createFromQuotation,createFromInstallationVisit,updateInvoice};
})();
