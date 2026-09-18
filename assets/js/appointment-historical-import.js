(function(){
  'use strict';

  const VIEW='appointmentDataImport';
  const PREVIEW_STEP=100;
  const VALIDATION_CHUNK=400;
  const $=id=>document.getElementById(id);
  const t=(key,fallback,vars={})=>{
    const value=window.PetatoeLocalization?.t?.(key,vars);
    return value&&value!==key?value:fallback;
  };

  const HEADER_DEFS=Object.freeze([
    Object.freeze({key:'itemName',ar:'اسم الصنف',aliases:['اسم الصنف','الصنف','item name','item']}),
    Object.freeze({key:'vehicle',ar:'السيارة',aliases:['السيارة','المركبة','vehicle','car']}),
    Object.freeze({key:'dateRaw',ar:'التاريخ',aliases:['التاريخ','date']}),
    Object.freeze({key:'month',ar:'الشهر',aliases:['الشهر','month']}),
    Object.freeze({key:'invoiceNumber',ar:'رقم الفاتورة',aliases:['رقم الفاتورة','invoice number','invoice no','invoice']}),
    Object.freeze({key:'customer',ar:'العميل',aliases:['العميل','اسم العميل','customer','customer name']}),
    Object.freeze({key:'unitPrice',ar:'سعر الوحدة',aliases:['سعر الوحدة','unit price']}),
    Object.freeze({key:'quantity',ar:'الكمية',aliases:['الكمية','quantity','qty']}),
    Object.freeze({key:'discount',ar:'الخصم',aliases:['الخصم','discount']}),
    Object.freeze({key:'tax',ar:'الضريبة',aliases:['الضريبة','tax','vat']}),
    Object.freeze({key:'salesInclusive',ar:'المبيعات شامل الضريبة',aliases:['المبيعات شامل الضريبة','المبيعات شاملة الضريبة','sales incl tax','sales inclusive','sales including tax']}),
    Object.freeze({key:'salesBeforeTax',ar:'المبيعات قبل الضريبة',aliases:['المبيعات قبل الضريبة','sales before tax','net sales']}),
    Object.freeze({key:'paymentMethod',ar:'طريقة السداد',aliases:['طريقة السداد','طريقة الدفع','payment method','payment']})
  ]);
  const TEMPLATE_HEADERS=Object.freeze(HEADER_DEFS.map(item=>item.ar));

  const state={
    file:null,
    fileSha256:'',
    rows:[],
    results:[],
    summary:null,
    displayLimit:PREVIEW_STEP,
    busy:false,
    validated:false,
    imported:false
  };

  function normHeader(value){
    return String(value??'')
      .replace(/\u00a0/g,' ')
      .replace(/[ـ]/g,'')
      .replace(/\s+/g,' ')
      .trim()
      .toLowerCase();
  }
  const aliasMap=(()=>{
    const map=new Map();
    HEADER_DEFS.forEach(def=>def.aliases.forEach(alias=>map.set(normHeader(alias),def.key)));
    return map;
  })();

  function normalizeCell(value){
    if(value===null||value===undefined) return '';
    if(value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
    if(typeof value==='string') return value.trim();
    return value;
  }
  function isBlank(value){return value===null||value===undefined||String(value).trim()==='';}
  function showStatus(message,type=''){
    const el=$('appointmentHistoricalImportStatus');
    if(!el)return;
    el.textContent=message||'';
    el.classList.toggle('hidden',!message);
    el.dataset.type=type||'';
  }
  function setProgress(percent,label,detail=''){
    const shell=$('appointmentHistoricalImportProgress');
    if(!shell)return;
    shell.classList.remove('hidden');
    const safe=Math.max(0,Math.min(100,Number(percent)||0));
    const bar=$('appointmentHistoricalImportProgressBar');
    const pct=$('appointmentHistoricalImportProgressPercent');
    const text=$('appointmentHistoricalImportProgressLabel');
    const rows=$('appointmentHistoricalImportProgressRows');
    if(bar)bar.style.width=`${safe}%`;
    if(pct)pct.textContent=`${Math.round(safe)}%`;
    if(text)text.textContent=label||'';
    if(rows)rows.textContent=detail||'';
  }
  function hideProgress(){
    $('appointmentHistoricalImportProgress')?.classList.add('hidden');
  }
  function can(action){return window.AppointmentHistoricalImportService?.can?.(action)===true;}
  function syncActions(){
    const offline=navigator.onLine===false;
    const choose=$('appointmentHistoricalImportChooseBtn');
    const validate=$('appointmentHistoricalImportValidateBtn');
    const execute=$('appointmentHistoricalImportExecuteBtn');
    const failed=$('appointmentHistoricalImportFailedExportBtn');
    if(choose) choose.disabled=state.busy||!can('view');
    if(validate) validate.disabled=state.busy||offline||!state.rows.length||!can('view');
    if(execute) execute.disabled=state.busy||offline||!state.validated||Number(state.summary?.valid||0)<=0||!can('add');
    if(failed) failed.disabled=state.busy||!state.results.some(row=>row?.valid===false&&!row?.duplicate)||!can('export');
  }
  function setBusy(value){state.busy=Boolean(value);syncActions();}
  function resetValidation(){
    state.results=[];
    state.summary=null;
    state.displayLimit=PREVIEW_STEP;
    state.validated=false;
    state.imported=false;
    renderSummary(null);
    renderPreview();
    hideProgress();
    syncActions();
  }
  function resetAll(){
    state.file=null;
    state.fileSha256='';
    state.rows=[];
    resetValidation();
    const input=$('appointmentHistoricalImportFileInput');
    if(input)input.value='';
    const name=$('appointmentHistoricalImportFileName');
    if(name)name.textContent=t('appointmentDataImport.noFile','لم يتم اختيار ملف');
    const meta=$('appointmentHistoricalImportFileMeta');
    if(meta)meta.textContent=t('appointmentDataImport.fileHint','اختر ملف Excel بالترتيب المعتمد للأعمدة.');
    showStatus('');
  }

  function findHeaderRow(matrix){
    const max=Math.min(matrix.length,15);
    for(let rowIndex=0;rowIndex<max;rowIndex+=1){
      const row=Array.isArray(matrix[rowIndex])?matrix[rowIndex]:[];
      const found=new Set(row.map(cell=>aliasMap.get(normHeader(cell))).filter(Boolean));
      if(found.size===HEADER_DEFS.length) return rowIndex;
    }
    return -1;
  }
  function buildColumnMap(headerRow){
    const map=new Map();
    headerRow.forEach((value,index)=>{
      const key=aliasMap.get(normHeader(value));
      if(key&&!map.has(key))map.set(key,index);
    });
    const missing=HEADER_DEFS.filter(def=>!map.has(def.key));
    if(missing.length){
      throw new Error(t('appointmentDataImport.error.missingHeaders','الأعمدة التالية غير موجودة في الملف: {headers}',{headers:missing.map(item=>item.ar).join('، ')}));
    }
    return map;
  }
  async function sha256(buffer){
    try{
      if(!window.crypto?.subtle)return '';
      const digest=await window.crypto.subtle.digest('SHA-256',buffer.slice(0));
      return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    }catch(_error){return '';}
  }
  async function parseFile(file){
    if(!file)throw new Error(t('appointmentDataImport.error.fileRequired','اختر ملف Excel أولًا.'));
    if(!window.XLSX)throw new Error(t('appointmentDataImport.error.excelMissing','مكتبة Excel غير محملة. أعد تحميل الصفحة ثم حاول مرة أخرى.'));
    if(!/\.(xlsx|xls)$/i.test(file.name||''))throw new Error(t('appointmentDataImport.error.fileType','الملف يجب أن يكون Excel بصيغة XLSX أو XLS.'));

    setProgress(8,t('appointmentDataImport.progress.reading','جاري قراءة ملف Excel...'));
    const buffer=await file.arrayBuffer();
    const hashPromise=sha256(buffer);
    const workbook=window.XLSX.read(buffer,{type:'array',cellDates:false});
    const sheetName=workbook.SheetNames.find(name=>workbook.Sheets[name]);
    const sheet=sheetName?workbook.Sheets[sheetName]:null;
    if(!sheet)throw new Error(t('appointmentDataImport.error.sheetMissing','ملف Excel لا يحتوي على ورقة بيانات.'));
    const matrix=window.XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:'',blankrows:false});
    const headerIndex=findHeaderRow(matrix);
    if(headerIndex<0)throw new Error(t('appointmentDataImport.error.headerRow','لم يتم العثور على صف الأعمدة المعتمد داخل أول 15 صفًا.'));
    const columns=buildColumnMap(matrix[headerIndex]||[]);
    const rows=[];
    for(let index=headerIndex+1;index<matrix.length;index+=1){
      const source=Array.isArray(matrix[index])?matrix[index]:[];
      const row={sourceRow:index+1};
      let hasValue=false;
      HEADER_DEFS.forEach(def=>{
        const value=normalizeCell(source[columns.get(def.key)]);
        row[def.key]=value;
        if(!isBlank(value))hasValue=true;
      });
      if(hasValue)rows.push(row);
    }
    if(!rows.length)throw new Error(t('appointmentDataImport.error.empty','ملف Excel لا يحتوي على صفوف بيانات.'));
    state.fileSha256=await hashPromise;
    setProgress(18,t('appointmentDataImport.progress.parsed','تمت قراءة الملف بنجاح.'),t('appointmentDataImport.progress.rows','{count} صف',{count:rows.length}));
    return rows;
  }

  function blankSummary(){
    return {total:0,valid:0,errors:0,duplicates:0,matchedCustomers:0,unmatchedCustomers:0,reviewCustomers:0,cashAggregates:0,correctedDates:0};
  }
  function mergeSummary(target,source){
    Object.keys(target).forEach(key=>target[key]+=Number(source?.[key]||0));
    return target;
  }
  async function validateRows(){
    if(state.busy||!state.rows.length)return;
    setBusy(true);
    state.results=[];
    state.summary=blankSummary();
    state.displayLimit=PREVIEW_STEP;
    state.validated=false;
    state.imported=false;
    renderSummary(state.summary);
    renderPreview();
    try{
      const total=state.rows.length;
      for(let start=0;start<total;start+=VALIDATION_CHUNK){
        const chunk=state.rows.slice(start,start+VALIDATION_CHUNK);
        const result=await window.AppointmentHistoricalImportService.validateRows(chunk);
        mergeSummary(state.summary,result?.summary||{});
        state.results.push(...(Array.isArray(result?.rows)?result.rows:[]));
        const done=Math.min(total,start+chunk.length);
        const percent=20+(done/total)*50;
        setProgress(percent,t('appointmentDataImport.progress.validating','جاري فحص وربط البيانات...'),t('appointmentDataImport.progress.rowCount','{done} / {total}',{done,total}));
        renderSummary(state.summary);
      }
      state.validated=true;
      setProgress(72,t('appointmentDataImport.progress.ready','اكتمل الفحص والملف جاهز للمراجعة.'));
      renderPreview();
      const errors=Number(state.summary.errors||0);
      const duplicates=Number(state.summary.duplicates||0);
      const review=Number(state.summary.reviewCustomers||0);
      if(errors||review){
        showStatus(t('appointmentDataImport.status.review','اكتمل الفحص: {valid} صف صالح، {errors} به أخطاء، {review} يحتاج مراجعة ربط عميل، و{duplicates} مكرر.',{valid:state.summary.valid,errors,review,duplicates}),'warning');
      }else{
        showStatus(t('appointmentDataImport.status.ready','اكتمل الفحص: {valid} صف صالح و{duplicates} مكرر. يمكنك بدء الاستيراد.',{valid:state.summary.valid,duplicates}),'success');
      }
    }catch(error){
      state.validated=false;
      showStatus(error?.message||t('appointmentDataImport.error.validate','تعذر فحص ملف البيانات القديمة.'),'error');
      setProgress(0,t('appointmentDataImport.progress.failed','توقف الفحص بسبب خطأ.'));
    }finally{
      setBusy(false);
      syncActions();
    }
  }

  function money(value){
    const n=Number(value);
    return Number.isFinite(n)?new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:2}).format(n):'—';
  }
  function text(value,fallback='—'){const s=String(value??'').trim();return s||fallback;}
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function codeLabel(code){
    const raw=String(code||'').trim();
    if(!raw)return '';
    return t(`appointmentDataImport.code.${raw}`,raw);
  }
  function matchLabel(status,method,recordType){
    if(recordType==='cash_aggregate')return t('appointmentDataImport.match.cash','بيانات نقدية مجمعة');
    if(status==='matched'&&method==='legacy_code')return t('appointmentDataImport.match.code','مطابق بكود العميل');
    if(status==='matched'&&method==='mobile')return t('appointmentDataImport.match.mobile','مطابق برقم الجوال');
    if(status==='needs_review')return t('appointmentDataImport.match.review','يحتاج مراجعة');
    if(status==='not_applicable')return t('appointmentDataImport.match.notApplicable','غير منطبق');
    return t('appointmentDataImport.match.unmatched','لا يوجد عميل مطابق');
  }
  function stateDescriptor(row){
    if(row?.duplicate)return {label:t('appointmentDataImport.row.duplicate','مكرر'),cls:'is-info'};
    if(row?.valid===false)return {label:t('appointmentDataImport.row.error','خطأ'),cls:'is-danger'};
    const n=row?.normalized||{};
    if(n.recordType==='cash_aggregate')return {label:t('appointmentDataImport.row.cash','نقدي مجمع'),cls:'is-info'};
    if(n.customerMatchStatus==='needs_review')return {label:t('appointmentDataImport.row.review','مراجعة'),cls:'is-warning'};
    if(n.customerMatchStatus==='matched')return {label:t('appointmentDataImport.row.ready','جاهز'),cls:'is-success'};
    return {label:t('appointmentDataImport.row.unmatched','غير مرتبط'),cls:'is-warning'};
  }
  function renderSummary(summary){
    const shell=$('appointmentHistoricalImportSummary');
    if(!shell)return;
    if(!summary){shell.classList.add('hidden');return;}
    shell.classList.remove('hidden');
    const values={
      Total:summary.total,
      Valid:summary.valid,
      Errors:summary.errors,
      Duplicates:summary.duplicates,
      Matched:summary.matchedCustomers,
      Unmatched:summary.unmatchedCustomers,
      Review:summary.reviewCustomers,
      Cash:summary.cashAggregates,
      Corrected:summary.correctedDates
    };
    Object.entries(values).forEach(([key,value])=>{const el=$(`appointmentHistoricalImportSummary${key}`);if(el)el.textContent=String(Number(value||0));});
  }
  function notesHtml(row){
    const errors=(Array.isArray(row?.errors)?row.errors:[]).map(codeLabel).filter(Boolean);
    const warnings=(Array.isArray(row?.warnings)?row.warnings:[]).map(codeLabel).filter(Boolean);
    if(!errors.length&&!warnings.length)return '<span>—</span>';
    return `<div class="appointment-history-import-notes">${errors.map(item=>`<small class="error">${escapeHtml(item)}</small>`).join('')}${warnings.map(item=>`<small class="warning">${escapeHtml(item)}</small>`).join('')}</div>`;
  }
  function previewRowHtml(row){
    const n=row?.normalized||{};
    const descriptor=stateDescriptor(row);
    const matched=[n.matchedCustomerNumber,n.matchedCustomerName].filter(Boolean).join(' — ')||'—';
    const sourceIdentity=[n.customerCode?`#${n.customerCode}`:'',n.customerPhone||''].filter(Boolean).join(' / ')||'—';
    return `<tr>
      <td class="numeric">${escapeHtml(row?.sourceRow||'—')}</td>
      <td><span class="appointment-history-import-state ${descriptor.cls}">${escapeHtml(descriptor.label)}</span></td>
      <td class="nowrap">${escapeHtml(text(n.invoiceNumber))}</td>
      <td class="nowrap">${escapeHtml(text(n.date))}${n.dateCorrected?`<br><small>${escapeHtml(t('appointmentDataImport.date.corrected','تم تصحيح التاريخ من الملف'))}</small>`:''}</td>
      <td>${escapeHtml(text(n.itemNameDisplay))}</td>
      <td>${escapeHtml(text(n.vehicle))}</td>
      <td><div class="appointment-history-import-customer"><strong>${escapeHtml(text(n.customerRaw))}</strong><small>${escapeHtml(sourceIdentity)}</small></div></td>
      <td><div class="appointment-history-import-customer"><strong>${escapeHtml(matchLabel(n.customerMatchStatus,n.customerMatchMethod,n.recordType))}</strong><small>${escapeHtml(matched)}</small></div></td>
      <td class="numeric">${escapeHtml(money(n.unitPrice))}</td>
      <td class="numeric">${escapeHtml(money(n.quantity))}</td>
      <td class="numeric">${escapeHtml(money(n.discount))}</td>
      <td class="numeric">${escapeHtml(money(n.tax))}</td>
      <td class="numeric">${escapeHtml(money(n.salesInclusive))}</td>
      <td class="numeric">${escapeHtml(money(n.salesBeforeTax))}</td>
      <td>${escapeHtml(text(n.paymentMethod))}</td>
      <td>${notesHtml(row)}</td>
    </tr>`;
  }
  function renderPreview(){
    const body=$('appointmentHistoricalImportPreviewBody');
    const more=$('appointmentHistoricalImportLoadMore');
    const note=$('appointmentHistoricalImportPreviewNote');
    if(!body)return;
    if(!state.results.length){
      body.innerHTML=`<tr><td colspan="16" class="appointment-history-import-empty">${escapeHtml(state.rows.length?t('appointmentDataImport.preview.awaitValidation','اضغط «فحص الملف» لعرض نتيجة التحقق وربط العملاء.'):t('appointmentDataImport.preview.empty','اختر ملف Excel لعرض المعاينة.'))}</td></tr>`;
      if(more)more.classList.add('hidden');
      if(note)note.textContent='';
      return;
    }
    const limit=Math.min(state.displayLimit,state.results.length);
    body.innerHTML=state.results.slice(0,limit).map(previewRowHtml).join('');
    if(more){
      more.classList.toggle('hidden',limit>=state.results.length);
      const button=more.querySelector('button');
      if(button)button.textContent=t('appointmentDataImport.preview.more','عرض المزيد ({remaining})',{remaining:state.results.length-limit});
    }
    if(note)note.textContent=t('appointmentDataImport.preview.count','يتم عرض {shown} من {total} صف.',{shown:limit,total:state.results.length});
  }

  function originalBySourceRow(sourceRow){return state.rows.find(item=>Number(item.sourceRow)===Number(sourceRow))||{};}
  function exportFailedRows(){
    try{
      if(!window.XLSX)throw new Error(t('appointmentDataImport.error.excelMissing','مكتبة Excel غير محملة.'));
      const failed=state.results.filter(row=>row?.valid===false&&!row?.duplicate);
      if(!failed.length)throw new Error(t('appointmentDataImport.error.noFailedRows','لا توجد صفوف فاشلة للتصدير.'));
      const records=failed.map(result=>{
        const source=originalBySourceRow(result.sourceRow);
        const n=result.normalized||{};
        return {
          'رقم الصف':result.sourceRow,
          'اسم الصنف':source.itemName??'',
          'السيارة':source.vehicle??'',
          'التاريخ':source.dateRaw??'',
          'الشهر':source.month??'',
          'رقم الفاتورة':source.invoiceNumber??'',
          'العميل':source.customer??'',
          'سعر الوحدة':source.unitPrice??'',
          'الكمية':source.quantity??'',
          'الخصم':source.discount??'',
          'الضريبة':source.tax??'',
          'المبيعات شامل الضريبة':source.salesInclusive??'',
          'المبيعات قبل الضريبة':source.salesBeforeTax??'',
          'طريقة السداد':source.paymentMethod??'',
          'حالة ربط العميل':matchLabel(n.customerMatchStatus,n.customerMatchMethod,n.recordType),
          'العميل المطابق':[n.matchedCustomerNumber,n.matchedCustomerName].filter(Boolean).join(' — '),
          'الأخطاء':(result.errors||[]).map(codeLabel).join(' — '),
          'التحذيرات':(result.warnings||[]).map(codeLabel).join(' — ')
        };
      });
      const sheet=window.XLSX.utils.json_to_sheet(records);
      sheet['!cols']=[{wch:10},{wch:28},{wch:28},{wch:16},{wch:12},{wch:18},{wch:38},{wch:14},{wch:12},{wch:12},{wch:12},{wch:20},{wch:20},{wch:20},{wch:22},{wch:34},{wch:46},{wch:46}];
      const workbook=window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook,sheet,'الصفوف الفاشلة');
      window.XLSX.writeFile(workbook,`PETATOE_Historical_Import_Failed_${Date.now()}.xlsx`,{compression:true});
      showStatus(t('appointmentDataImport.status.failedExported','تم إنشاء ملف الصفوف الفاشلة بنجاح.'),'success');
    }catch(error){showStatus(error?.message||t('appointmentDataImport.error.exportFailed','تعذر تصدير الصفوف الفاشلة.'),'error');}
  }
  function downloadTemplate(){
    try{
      if(!window.XLSX)throw new Error(t('appointmentDataImport.error.excelMissing','مكتبة Excel غير محملة.'));
      const dataSheet=window.XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
      dataSheet['!cols']=[{wch:30},{wch:28},{wch:16},{wch:12},{wch:18},{wch:40},{wch:14},{wch:12},{wch:12},{wch:12},{wch:22},{wch:22},{wch:20}];
      const rules=[
        ['PETATOE — رفع البيانات التاريخية'],
        ['القاعدة','التفاصيل'],
        ['الصنف غير المحدد','مقبول، ولا يتم إنشاء صنف جديد تلقائيًا.'],
        ['العميل','الربط الآلي يتم بكود العميل أولًا ثم رقم الجوال. لا يتم الربط بالاسم وحده.'],
        ['الفاتورة بدون ضريبة','إذا كانت الضريبة 0 يمكن أن يتساوى المبلغ قبل الضريبة مع المبلغ شامل الضريبة.'],
        ['التاريخ','التاريخ هو المصدر الأساسي، وعمود الشهر للتحقق. تواريخ يوليو المؤكدة يتم تصحيحها بواسطة قاعدة الاستيراد المعتمدة.'],
        ['التكرار','إعادة رفع نفس الملف لا تكرر السطر المستورد مسبقًا.']
      ];
      const rulesSheet=window.XLSX.utils.aoa_to_sheet(rules);
      rulesSheet['!cols']=[{wch:25},{wch:92}];
      const workbook=window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook,dataSheet,'البيانات');
      window.XLSX.utils.book_append_sheet(workbook,rulesSheet,'تعليمات');
      window.XLSX.writeFile(workbook,'PETATOE_Historical_Sales_Import_Template.xlsx',{compression:true});
      showStatus(t('appointmentDataImport.status.templateDownloaded','تم تنزيل نموذج Excel.'),'success');
    }catch(error){showStatus(error?.message||t('appointmentDataImport.error.template','تعذر إنشاء نموذج Excel.'),'error');}
  }

  async function chooseFile(file){
    if(!file)return;
    resetValidation();
    state.file=file;
    const name=$('appointmentHistoricalImportFileName');
    const meta=$('appointmentHistoricalImportFileMeta');
    if(name)name.textContent=file.name;
    if(meta)meta.textContent=t('appointmentDataImport.fileReading','جاري قراءة الملف...');
    setBusy(true);
    showStatus(t('appointmentDataImport.status.reading','جاري قراءة ملف Excel والتحقق من الأعمدة...'),'info');
    try{
      state.rows=await parseFile(file);
      if(meta)meta.textContent=t('appointmentDataImport.fileReady','تم تجهيز {count} صف للفحص. اضغط «فحص الملف».',{count:state.rows.length});
      showStatus(t('appointmentDataImport.status.parsed','تمت قراءة الملف بنجاح. اضغط «فحص الملف» لبدء المطابقة مع النظام.'),'success');
      renderPreview();
    }catch(error){
      state.rows=[];
      state.fileSha256='';
      if(meta)meta.textContent=t('appointmentDataImport.fileInvalid','تعذر تجهيز الملف.');
      showStatus(error?.message||t('appointmentDataImport.error.read','تعذر قراءة ملف Excel.'),'error');
      setProgress(0,t('appointmentDataImport.progress.failed','توقف الفحص بسبب خطأ.'));
    }finally{setBusy(false);syncActions();}
  }

  async function executeImport(){
    if(state.busy||!state.validated||!state.file||!state.rows.length)return;
    const valid=Number(state.summary?.valid||0);
    const errors=Number(state.summary?.errors||0);
    const duplicates=Number(state.summary?.duplicates||0);
    const message=t('appointmentDataImport.confirm.import','سيتم استيراد الصفوف الصالحة فقط. صالح: {valid}، أخطاء: {errors}، مكرر: {duplicates}. هل تريد المتابعة؟',{valid,errors,duplicates});
    if(!window.confirm(message))return;
    setBusy(true);
    showStatus(t('appointmentDataImport.status.importing','جاري حفظ البيانات التاريخية... لا تغلق الصفحة.'),'info');
    setProgress(82,t('appointmentDataImport.progress.importing','جاري حفظ الصفوف الصالحة في السجل التاريخي...'),t('appointmentDataImport.progress.rowCount','{done} / {total}',{done:0,total:state.rows.length}));
    try{
      const result=await window.AppointmentHistoricalImportService.importRows(state.file.name,state.fileSha256,state.rows);
      state.results=Array.isArray(result?.rows)?result.rows:state.results;
      state.summary={
        total:Number(result?.summary?.total||state.rows.length),
        valid:Number(result?.summary?.inserted||0),
        errors:Number(result?.summary?.rejected||0),
        duplicates:Number(result?.summary?.duplicates||0),
        matchedCustomers:Number(result?.summary?.matchedCustomers||0),
        unmatchedCustomers:Number(result?.summary?.unmatchedCustomers||0),
        reviewCustomers:Number(result?.summary?.reviewCustomers||0),
        cashAggregates:Number(result?.summary?.cashAggregates||0),
        correctedDates:Number(result?.summary?.correctedDates||0)
      };
      state.imported=true;
      state.validated=true;
      renderSummary(state.summary);
      renderPreview();
      setProgress(100,t('appointmentDataImport.progress.complete','اكتمل الاستيراد.'),t('appointmentDataImport.progress.rowCount','{done} / {total}',{done:state.rows.length,total:state.rows.length}));
      showStatus(t('appointmentDataImport.status.complete','اكتمل الاستيراد: تم إدخال {inserted} صف، تجاهل {duplicates} مكرر، ورفض {rejected} صف.',{inserted:result?.summary?.inserted||0,duplicates:result?.summary?.duplicates||0,rejected:result?.summary?.rejected||0}),'success');
    }catch(error){
      showStatus(error?.message||t('appointmentDataImport.error.import','تعذر تنفيذ استيراد البيانات القديمة.'),'error');
      setProgress(72,t('appointmentDataImport.progress.importFailed','تعذر إكمال الاستيراد. يمكنك المراجعة والمحاولة مرة أخرى.'));
    }finally{setBusy(false);syncActions();}
  }

  function onLanguage(){
    renderSummary(state.summary);
    renderPreview();
    syncActions();
  }
  function bind(){
    $('appointmentHistoricalImportTemplateBtn')?.addEventListener('click',downloadTemplate);
    $('appointmentHistoricalImportChooseBtn')?.addEventListener('click',()=>$('appointmentHistoricalImportFileInput')?.click());
    $('appointmentHistoricalImportFileInput')?.addEventListener('change',event=>chooseFile(event.currentTarget.files?.[0]||null));
    $('appointmentHistoricalImportValidateBtn')?.addEventListener('click',validateRows);
    $('appointmentHistoricalImportExecuteBtn')?.addEventListener('click',executeImport);
    $('appointmentHistoricalImportFailedExportBtn')?.addEventListener('click',exportFailedRows);
    $('appointmentHistoricalImportResetBtn')?.addEventListener('click',resetAll);
    $('appointmentHistoricalImportLoadMore')?.querySelector('button')?.addEventListener('click',()=>{state.displayLimit+=PREVIEW_STEP;renderPreview();});
    window.addEventListener('kyum-view-changed',event=>{
      if(event.detail?.view!==VIEW)return;
      syncActions();
      if(navigator.onLine===false)showStatus(t('appointmentDataImport.error.onlineRequired','تحتاج هذه الشاشة اتصالًا بالإنترنت للفحص والاستيراد.'),'warning');
    });
    window.addEventListener('petatoe-language-changed',onLanguage);
    window.addEventListener('petatoe-localization-updated',onLanguage);
    window.addEventListener('online',()=>{syncActions();if(window.KYUMNavigation?.current?.()===VIEW&&state.rows.length)showStatus(t('appointmentDataImport.status.onlineReady','عاد الاتصال. يمكنك فحص الملف أو استكمال الاستيراد.'),'info');});
    window.addEventListener('offline',()=>{syncActions();if(window.KYUMNavigation?.current?.()===VIEW)showStatus(t('appointmentDataImport.error.onlineRequired','تحتاج هذه الشاشة اتصالًا بالإنترنت للفحص والاستيراد.'),'warning');});
    resetAll();
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind,{once:true}):bind();
})();
