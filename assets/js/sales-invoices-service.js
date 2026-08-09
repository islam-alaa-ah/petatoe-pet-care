(()=>{
  "use strict";
  const db=()=>{if(!window.customerSupabase)throw new Error("اتصال Supabase غير جاهز.");return window.customerSupabase};
  const requireAction=(action)=>{if(!window.CustomerPermissions?.requireAction?.("salesInvoices",action,{silent:true}))throw new Error("ليس لديك صلاحية تنفيذ هذا الإجراء على فواتير المبيعات.")};
  const normalize=r=>({id:r.id,requestNumber:r.request_number||"—",customerName:r.customer?.customer_name||"—",invoiceNumber:r.invoice_number||"",invoiceAmount:Number(r.invoice_amount||0),installationExpenses:Number(r.installation_expenses||0),representativeName:r.representative?.full_name||"—",invoiceDate:r.invoice_date||"",sourceType:r.source_type||"quotation",status:r.status||"صادرة",quotationId:r.quotation_id||"",installationRequestId:r.installation_request_id||"",installationExecutionVisitId:r.installation_execution_visit_id||""});
  async function list(){requireAction("view");const {data,error}=await db().from("sales_invoices").select("id,request_number,invoice_number,invoice_amount,installation_expenses,invoice_date,source_type,status,quotation_id,installation_request_id,installation_execution_visit_id,customer:customers(id,customer_name),representative:sales_representatives(id,full_name)").order("invoice_date",{ascending:false}).order("created_at",{ascending:false});if(error)throw new Error("تعذر تحميل فواتير المبيعات: "+error.message);return (data||[]).map(normalize)}
  async function createFromQuotation(payload){requireAction("add");const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim();if(!/^\d{9}$/.test(invoiceNumber))throw new Error("رقم الفاتورة يجب أن يتكون من 9 أرقام إنجليزية بالضبط.");if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");const {data,error}=await db().rpc("create_sales_invoice_from_quotation",{p_quotation_id:payload.quotationId,p_invoice_number:invoiceNumber,p_invoice_date:invoiceDate});if(error)throw new Error("تعذر تحويل العقد إلى فاتورة: "+error.message);return Array.isArray(data)?data[0]:data}

  async function createFromInstallationVisit(payload){
    requireAction("add");
    const invoiceNumber=String(payload?.invoiceNumber||"").trim(),invoiceDate=String(payload?.invoiceDate||"").trim();
    if(!payload?.installationRequestId||!payload?.visitId)throw new Error("بيانات زيارة التركيب غير مكتملة.");
    if(!/^\d{9}$/.test(invoiceNumber))throw new Error("رقم الفاتورة يجب أن يتكون من 9 أرقام إنجليزية بالضبط.");
    if(!invoiceDate)throw new Error("تاريخ الفاتورة مطلوب.");
    const {data,error}=await db().rpc("create_sales_invoice_from_installation_visit",{p_installation_request_id:payload.installationRequestId,p_visit_id:payload.visitId,p_invoice_number:invoiceNumber,p_invoice_date:invoiceDate});
    if(error)throw new Error("تعذر تحويل الكمية المنفذة إلى فاتورة: "+error.message);
    return Array.isArray(data)?data[0]:data;
  }
  window.SalesInvoicesService={list,createFromQuotation,createFromInstallationVisit};
})();
