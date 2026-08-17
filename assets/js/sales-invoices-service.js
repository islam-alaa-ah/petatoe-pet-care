(()=>{
  "use strict";
  const db=()=>{if(!window.customerSupabase)throw new Error("اتصال Supabase غير جاهز.");return window.customerSupabase};
  const requireAction=(action)=>{if(!window.CustomerPermissions?.requireAction?.("salesInvoices",action,{silent:true}))throw new Error("ليس لديك صلاحية تنفيذ هذا الإجراء على فواتير المبيعات.")};
  const normalize=r=>{const invoiceAmount=Number(r.invoice_amount||0);return {id:r.id,requestNumber:r.request_number||"—",customerName:r.customer?.customer_name||"—",invoiceNumber:r.is_without_invoice?"بدون فاتورة":(r.invoice_number||""),storedInvoiceNumber:r.invoice_number||"",isWithoutInvoice:Boolean(r.is_without_invoice),invoiceAmount,invoiceAmountInclTax:Math.round(invoiceAmount*1.15*100)/100,installationExpenses:Number(r.installation_expenses||0),representativeName:r.representative?.full_name||"—",invoiceDate:r.invoice_date||"",sourceType:r.source_type||"quotation",status:r.status||"صادرة",quotationId:r.quotation_id||"",installationRequestId:r.installation_request_id||"",installationExecutionVisitId:r.installation_execution_visit_id||"",attachments:Array.isArray(r.attachments)?r.attachments:[]}};
  async function list(){
    requireAction("view");
    const {data,error}=await db().from("sales_invoices").select("id,request_number,invoice_number,is_without_invoice,invoice_amount,installation_expenses,invoice_date,source_type,status,quotation_id,installation_request_id,installation_execution_visit_id,customer:customers(id,customer_name),representative:sales_representatives(id,full_name)").order("invoice_date",{ascending:false}).order("created_at",{ascending:false});
    if(error)throw new Error("تعذر تحميل فواتير المبيعات: "+error.message);
    const requestIds=[...new Set((data||[]).map(x=>x.installation_request_id).filter(Boolean))];
    let attachments=[];
    if(requestIds.length){const {data:files,error:fe}=await db().from("installation_execution_files").select("id,installation_request_id,execution_visit_id,storage_path,original_name,mime_type,file_size,file_kind,uploaded_at").in("installation_request_id",requestIds).order("uploaded_at",{ascending:true});if(fe)throw new Error("تعذر تحميل مرفقات التنفيذ: "+fe.message);attachments=files||[]}
    const byRequest=new Map();attachments.forEach(f=>{const a=byRequest.get(String(f.installation_request_id))||[];a.push({id:f.id,storagePath:f.storage_path,originalName:f.original_name||"مرفق",mimeType:f.mime_type||"",fileSize:Number(f.file_size||0),fileKind:f.file_kind||"execution",visitId:f.execution_visit_id||"",uploadedAt:f.uploaded_at||""});byRequest.set(String(f.installation_request_id),a)});
    return (data||[]).map(r=>{const all=byRequest.get(String(r.installation_request_id))||[];const attachments=r.installation_execution_visit_id?all.filter(f=>!f.visitId||String(f.visitId)===String(r.installation_execution_visit_id)):all;return normalize({...r,attachments})})
  }
  async function createFromQuotation(payload){requireAction("add");const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim();if(!invoiceNumber)throw new Error("رقم الفاتورة مطلوب.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");const {data,error}=await db().rpc("create_sales_invoice_from_quotation",{p_quotation_id:payload.quotationId,p_invoice_number:invoiceNumber,p_invoice_date:invoiceDate});if(error)throw new Error("تعذر تحويل العقد إلى فاتورة: "+error.message);return Array.isArray(data)?data[0]:data}
  async function createFromInstallationVisit(payload){
    requireAction("add");
    const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim(),withoutInvoice=Boolean(payload?.withoutInvoice);
    if(!payload?.installationRequestId||!payload?.visitId)throw new Error("بيانات زيارة التركيب غير مكتملة.");
    if(!withoutInvoice&&!invoiceNumber)throw new Error("رقم الفاتورة مطلوب أو اختر بدون فاتورة.");
    if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");
    const {data,error}=await db().rpc("create_sales_invoice_from_installation_visit_v2",{p_installation_request_id:payload.installationRequestId,p_visit_id:payload.visitId,p_invoice_number:withoutInvoice?null:invoiceNumber,p_invoice_date:invoiceDate,p_without_invoice:withoutInvoice});
    if(error)throw new Error("تعذر تحويل الكمية المنفذة إلى فاتورة: "+error.message);
    return Array.isArray(data)?data[0]:data;
  }
  async function updateInvoice(payload){
    requireAction("edit");
    const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim(),withoutInvoice=Boolean(payload?.withoutInvoice);
    if(!payload?.id)throw new Error("معرّف الفاتورة مطلوب.");
    if(!withoutInvoice&&!invoiceNumber)throw new Error("رقم الفاتورة مطلوب أو اختر بدون فاتورة.");
    if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");
    const {data,error}=await db().rpc("update_sales_invoice_registry",{p_invoice_id:payload.id,p_invoice_number:withoutInvoice?null:invoiceNumber,p_invoice_date:invoiceDate,p_without_invoice:withoutInvoice});
    if(error)throw new Error("تعذر تعديل بيانات الفاتورة: "+error.message);
    return Array.isArray(data)?data[0]:data;
  }
  window.SalesInvoicesService={list,createFromQuotation,createFromInstallationVisit,updateInvoice};
})();
