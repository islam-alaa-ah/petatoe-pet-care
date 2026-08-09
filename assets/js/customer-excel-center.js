// PETATOE — Customer Excel Center: canonical customer master v2
(function () {
  const EXPORT_HEADERS = ["code", "name", "address", "mobile"];
  const safeText = value => value == null ? "" : String(value);
  function requireXlsx(){ if(!window.XLSX) throw new Error("مكتبة Excel غير محملة."); }
  function normalizePhone(value){
    let p=safeText(value).trim().replace(/[^\d+]/g,"");
    if(p.startsWith("+966")) p=`0${p.slice(4)}`;
    if(p.startsWith("966")) p=`0${p.slice(3)}`;
    if(p.startsWith("5")&&p.length===9) p=`0${p}`;
    return p.replace(/\D/g,"");
  }
  function customerToRow(c){ return {code:safeText(c.customerNumber||c.code),name:safeText(c.name),address:safeText(c.address),mobile:safeText(c.phone||c.mobile)}; }
  function applyLayout(sheet,rowCount){
    sheet["!cols"]=[{wch:18},{wch:32},{wch:45},{wch:18}];
    sheet["!autofilter"]={ref:`A1:D${Math.max(1,rowCount+1)}`};
    for(let r=2;r<=rowCount+1;r++){ for(const col of ["A","D"]){ const c=sheet[`${col}${r}`]; if(c){c.t="s";c.z="@";} } }
  }
  function exportCustomers(customers,options={}){
    requireXlsx(); const rows=(customers||[]).map(customerToRow);
    const sheet=XLSX.utils.json_to_sheet(rows,{header:EXPORT_HEADERS,skipHeader:false}); applyLayout(sheet,rows.length);
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,sheet,"Customers");
    XLSX.writeFile(wb,`PETATOE_Customers_${options.filtered?"Filtered":"All"}_${new Date().toISOString().slice(0,19).replaceAll(":","-")}.xlsx`,{compression:true});
    return rows.length;
  }
  function downloadTemplate(){
    requireXlsx();
    const sheet=XLSX.utils.json_to_sheet([{code:"CUST-001",name:"اسم العميل",address:"جدة - حي ...",mobile:"0500000000"}],{header:EXPORT_HEADERS,skipHeader:false});
    applyLayout(sheet,1);
    const ins=XLSX.utils.aoa_to_sheet([["تعليمات نموذج العملاء"],["الأعمدة المعتمدة فقط: code | name | address | mobile"],["code و name و mobile مطلوبة، و address اختياري."],["لا تغيّر أسماء الأعمدة."]]); ins["!cols"]=[{wch:85}];
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,sheet,"Customers"); XLSX.utils.book_append_sheet(wb,ins,"Instructions");
    XLSX.writeFile(wb,"PETATOE_Customers_Import_Template.xlsx",{compression:true});
  }
  const aliases={
    customerNumber:["code","customer_number","رقم العميل","كود العميل"],
    name:["name","customer_name","اسم العميل"],
    address:["address","العنوان"],
    phone:["mobile","phone","رقم الجوال","الجوال"]
  };
  const norm=v=>safeText(v).trim().toLowerCase().replace(/\s+/g," ");
  function resolveField(h){ const n=norm(h); return Object.entries(aliases).find(([,a])=>a.some(x=>norm(x)===n))?.[0]||null; }
  async function parseImportFile(file){
    requireXlsx(); if(!file) throw new Error("اختر ملف Excel أولًا.");
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true,raw:false}); const sn=wb.SheetNames.find(n=>norm(n)==="customers")||wb.SheetNames[0];
    const matrix=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:"",raw:false,blankrows:false}); if(matrix.length<2) throw new Error("ملف Excel لا يحتوي على صفوف عملاء.");
    const headers=matrix[0].map(resolveField); for(const f of ["customerNumber","name","phone"]) if(!headers.includes(f)) throw new Error("الملف يجب أن يحتوي على الأعمدة: code, name, address, mobile.");
    return matrix.slice(1).filter(r=>r.some(c=>safeText(c).trim())).map((row,i)=>{ const rec={sourceRow:i+2,customerNumber:"",name:"",address:"",phone:""}; headers.forEach((f,j)=>{if(!f)return; rec[f]=f==="phone"?normalizePhone(row[j]):safeText(row[j]).trim();}); return rec; });
  }
  function buildImportPreview(rows,context={}){
    const byPhone=new Map((context.customers||[]).map(c=>[normalizePhone(c.phone),c])); const byCode=new Map((context.customers||[]).map(c=>[norm(c.customerNumber||c.code),c]));
    const phoneCounts=new Map(),codeCounts=new Map(); (rows||[]).forEach(r=>{phoneCounts.set(r.phone,(phoneCounts.get(r.phone)||0)+1);codeCounts.set(norm(r.customerNumber),(codeCounts.get(norm(r.customerNumber))||0)+1);});
    const out=(rows||[]).map(r=>{ const errors=[]; if(!r.customerNumber)errors.push("code مطلوب"); if(!r.name)errors.push("name مطلوب"); if(!/^05\d{8}$/.test(r.phone))errors.push("mobile غير صالح"); if(r.phone&&(phoneCounts.get(r.phone)||0)>1)errors.push("mobile مكرر داخل الملف"); if(r.customerNumber&&(codeCounts.get(norm(r.customerNumber))||0)>1)errors.push("code مكرر داخل الملف"); const ex=byPhone.get(r.phone)||byCode.get(norm(r.customerNumber))||null; return {...r,existingCustomer:ex,status:errors.length?"error":(ex?"existing":"new"),errors,statusNote:errors.join(" — ")||(ex?"عميل موجود":"جاهز")}; });
    return {rows:out,summary:{total:out.length,valid:out.filter(r=>!r.errors.length).length,errors:out.filter(r=>r.errors.length).length,newCustomers:out.filter(r=>r.status==="new").length,existingCustomers:out.filter(r=>r.status==="existing").length,duplicates:out.filter(r=>r.errors.some(e=>e.includes("مكرر"))).length}};
  }
  function exportFailedRows(failedRows){
    requireXlsx(); const rows=(failedRows||[]).map(x=>({row:x.sourceRow||"",code:x.customerNumber||x.code||"",name:x.name||"",address:x.address||"",mobile:x.phone||x.mobile||"",error:x.message||x.errors?.join(" — ")||""})); if(!rows.length)throw new Error("لا توجد صفوف فاشلة للتصدير."); const sh=XLSX.utils.json_to_sheet(rows); sh["!cols"]=[{wch:10},{wch:18},{wch:32},{wch:45},{wch:18},{wch:60}]; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,sh,"Failed Rows"); XLSX.writeFile(wb,`PETATOE_Customers_Failed_${Date.now()}.xlsx`,{compression:true}); return rows.length;
  }
  window.CustomerExcelCenter=Object.freeze({exportCustomers,downloadTemplate,parseImportFile,buildImportPreview,normalizePhone,exportFailedRows,headers:[...EXPORT_HEADERS]});
})();
