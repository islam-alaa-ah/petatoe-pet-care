(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const money = value => `SAR ${Number(value || 0).toFixed(2)}`;
  const appointmentT = (key, fallback, vars = {}) => { const value = window.PetatoeLocalization?.t?.(key, vars); return (!value || value === `[${key}]`) ? fallback : value; };
  const appointmentEntity = (kind, id, fallback = "") => window.PetatoeLocalization?.entityText?.(kind, id, fallback) || fallback;
  const appointmentStatusLabel = value => {
    const map={"جديد":"appointments.status.new","مسند":"appointments.status.assigned","مجدول":"appointments.status.scheduled","في الطريق":"appointments.status.onRoute","وصل إلى العميل":"appointments.status.arrived","قيد التنفيذ":"appointments.status.inProgress","مكتمل":"appointments.status.completed","ملغي":"appointments.status.cancelled","بانتظار المراجعة":"appointments.status.pendingReview"};
    return map[value]?appointmentT(map[value],value):String(value||"");
  };
  const latinDigits = value => String(value ?? "")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  function normalizeLatinNumericInput(input, { integer = false } = {}) {
    if (!input) return "";
    let value = latinDigits(input.value);
    if (integer) value = value.replace(/[^0-9]/g, "");
    else {
      value = value.replace(/[^0-9.]/g, "");
      const dot = value.indexOf(".");
      if (dot >= 0) value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, "");
    }
    if (input.value !== value) input.value = value;
    return value;
  }
  // P5.11.9 — VAT-inclusive display helpers used by appointment list/details.
  // They only affect presentation; persisted service prices and calculations are unchanged.
  const vatAmount = value => Math.round(Math.max(0, Number(value || 0)) * 1.15 * 100) / 100;
  const vatServiceLine = service => Math.round(vatAmount(service?.unitPrice) * Math.max(0, Number(service?.quantity || 0)) * 100) / 100;

  let rows = [];
  let opts = { customers: [], quotations: [], regions: [], cities: [], neighborhoods: [], serviceTypes: [] };
  let optionsLoaded = false;
  let editingRequestId = null;
  let editingReturnView = "installationRequests";
  let editingScheduleSnapshot = null;
  let scheduleTeams = [], scheduleTechnicians = [];
  const QUOTATION_PREFILL_KEY = "kyum:installation:quotation-prefill";
  let quotationPrefillPromise = null;
  let customerDefaultsSelectionToken = 0;


  function setSaveState(button,state,originalText){
    if(!button)return;
    if(state==='saving'){button.dataset.originalText=originalText||button.textContent;button.disabled=true;button.textContent=appointmentT('appointmentNew.action.saving','جاري الحفظ...');button.classList.add('is-saving');}
    else if(state==='saved'){button.textContent=appointmentT('appointmentNew.action.saved','تم الحفظ');button.classList.remove('is-saving');button.classList.add('is-saved');}
    else if(state==='error'){button.textContent=appointmentT('appointmentNew.action.saveError','تعذر الحفظ');button.classList.remove('is-saving');button.classList.add('is-save-error');}
    else{button.disabled=false;button.textContent=button.dataset.originalText||originalText||button.textContent;button.classList.remove('is-saving','is-saved','is-save-error');}
  }
  function status(node, message, type = "info") {
    if (!node) return;
    node.textContent = message;
    node.className = `data-status ${type}`;
  }

  function clearStatus(node) {
    if (!node) return;
    node.textContent = "";
    node.className = "data-status hidden";
  }

  function saveQuotationPrefillIntent(detail = {}) {
    if (!detail.quotationId) return;
    const payload = {
      quotationId: String(detail.quotationId),
      quotationNumber: String(detail.quotationNumber || ""),
      customerId: detail.customerId ? String(detail.customerId) : "",
      customerName: String(detail.customerName || ""),
      customerPhone: String(detail.customerPhone || ""),
      customerNumber: String(detail.customerNumber || ""),
      customerCity: String(detail.customerCity || ""),
      customerDistrict: String(detail.customerDistrict || ""),
      customerOrderNumber: String(detail.customerOrderNumber || ""),
      description: String(detail.description || ""),
      notes: String(detail.notes || ""),
      createdAt: Date.now()
    };
    try { sessionStorage.setItem(QUOTATION_PREFILL_KEY, JSON.stringify(payload)); } catch (_) {}
  }

  function instantCustomerLabel(intent = {}) {
    return [intent.customerName, intent.customerPhone, intent.customerNumber].filter(Boolean).join(" — ");
  }

  function applyInstantQuotationPrefill(detail = null) {
    const intent = detail?.quotationId ? detail : readQuotationPrefillIntent();
    if (!intent?.quotationId || editingRequestId) return false;

    saveQuotationPrefillIntent(intent);
    const customerId = String(intent.customerId || "");
    const customerInput = $("newInstallationCustomerSearch");
    const customerHidden = $("newInstallationCustomerId");
    if (customerHidden && customerId) customerHidden.value = customerId;
    if (customerInput) {
      customerInput.value = instantCustomerLabel(intent) || customerInput.value;
      customerInput.setCustomValidity("");
    }

    const quotationSelect = $("newInstallationQuotationId");
    if (quotationSelect) {
      const currentLabel = intent.quotationNumber || "العقد المحدد";
      quotationSelect.innerHTML = `<option value="">بدون عقد</option><option value="${esc(intent.quotationId)}" selected>${esc(currentLabel)}</option>`;
      quotationSelect.value = String(intent.quotationId);
    }


    const notesInput = $("newInstallationNotes");
    const prefillNotes = [intent.description, intent.notes].map(value => String(value || "").trim()).filter(Boolean).join("\n");
    if (notesInput && prefillNotes && !notesInput.value.trim()) notesInput.value = prefillNotes;

    const neighborhood = $("newInstallationNeighborhoodId");
    if (neighborhood) {
      neighborhood.dataset.pendingDistrict = String(intent.customerDistrict || "");
      neighborhood.dataset.pendingCity = String(intent.customerCity || "");
    }

    $("newInstallationRequestHeading").textContent = `موعد مرتبط بالعقد ${intent.quotationNumber || ""}`.trim();
    $("newInstallationRequestNote").textContent = "تم عرض بيانات العميل والعقد فورًا، ويجري التحقق منها في الخلفية.";
    status($("newInstallationRequestFormStatus"), "تم تعبئة البيانات الأساسية فورًا. جارٍ استكمال التحقق والقوائم المرجعية...", "info");
    return true;
  }

  function readQuotationPrefillIntent() {
    try {
      const raw = sessionStorage.getItem(QUOTATION_PREFILL_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload?.quotationId || Date.now() - Number(payload.createdAt || 0) > 30 * 60 * 1000) {
        sessionStorage.removeItem(QUOTATION_PREFILL_KEY);
        return null;
      }
      return payload;
    } catch (_) {
      return null;
    }
  }

  function clearQuotationPrefillIntent() {
    try { sessionStorage.removeItem(QUOTATION_PREFILL_KEY); } catch (_) {}
  }

  function normalizeArabicText(value) {
    return String(value || "").normalize("NFKC").replace(/[ًٌٍَُِّْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[،,؛;:()[\]{}]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function normalizeNeighborhoodKey(value) {
    return normalizeArabicText(value).replace(/^حي\s+/u, "").replace(/\s+(?:مدينه\s+)?جده$/u, "").replace(/\s+/g, " ").trim();
  }
  function matchNeighborhoodId(customer, defaults = null) {
    const explicitId = customer?.neighborhood_id || defaults?.neighborhoodId || "";
    if (explicitId && (opts.neighborhoods || []).some(item => String(item.id) === String(explicitId))) return explicitId;
    const keys = [customer?.address, defaults?.address].map(normalizeNeighborhoodKey).filter(Boolean);
    for (const key of keys) {
      const exact = (opts.neighborhoods || []).filter(item => normalizeNeighborhoodKey(item?.name) === key);
      if (exact.length === 1) return exact[0].id;
    }
    return "";
  }

  async function fetchQuotationPrefill(quotationId) {
    if (!window.customerSupabase) throw new Error("اتصال Supabase غير جاهز.");
    const { data, error } = await window.customerSupabase
      .from("quotations")
      .select(`
        id, quotation_number, customer_order_number, customer_id, representative_id,
        status, amount, description, notes, installation_request_id,
        customer:customers(id, customer_number, customer_name, address, phone)
      `)
      .eq("id", quotationId)
      .maybeSingle();
    if (error) throw new Error(`تعذر تحميل بيانات العقد: ${error.message}`);
    if (!data) throw new Error("العقد غير موجود أو غير متاح لهذا المستخدم.");
    if (data.status !== "مقبول") throw new Error("لا يمكن إنشاء موعد إلا من عقد مقبول.");
    if (data.installation_request_id) throw new Error("تم إنشاء موعد لهذا العقد بالفعل.");
    return data;
  }

  async function applyQuotationPrefill(detail = null) {
    const intent = detail?.quotationId ? detail : readQuotationPrefillIntent();
    if (!intent?.quotationId || editingRequestId) return false;
    if (quotationPrefillPromise) return quotationPrefillPromise;
    quotationPrefillPromise = (async () => {
      saveQuotationPrefillIntent(intent);
      applyInstantQuotationPrefill(intent);
      const [quotation] = await Promise.all([
        fetchQuotationPrefill(intent.quotationId),
        ensureOptions()
      ]);
      const customer = quotation.customer || opts.customers.find(item => item.id === quotation.customer_id);
      if (!customer?.id) throw new Error("تعذر تحميل بيانات العميل المرتبط بالعقد.");

      if (!opts.customers.some(item => item.id === customer.id)) opts.customers.push(customer);
      if (!opts.quotations.some(item => item.id === quotation.id)) opts.quotations.push(quotation);

      syncCustomerSearch(customer.id);
      await applyCustomerAppointmentDefaults(customer.id);
      quotationOptions(customer.id, "newInstallationQuotationId", quotation.id);
      const quotationSelect = $("newInstallationQuotationId");
      if (quotationSelect) quotationSelect.value = quotation.id;


      neighborhoodOptions();
      // P5.10.1: keep the neighborhood loaded from the customer defaults.

      const notes = [quotation.description, quotation.notes].map(value => String(value || "").trim()).filter(Boolean).join("\n");
      if (notes && $("newInstallationNotes") && !$("newInstallationNotes").value.trim()) $("newInstallationNotes").value = notes;

      $("newInstallationRequestHeading").textContent = `موعد مرتبط بالعقد ${quotation.quotation_number || ""}`.trim();
      $("newInstallationRequestNote").textContent = "تم تحميل بيانات العميل والعقد من Supabase. اختر الحي والخدمات وبيانات الحيوان ثم احفظ الموعد.";
      status($("newInstallationRequestFormStatus"), "تم تحميل بيانات العميل والعقد تلقائيًا.", "success");
      clearQuotationPrefillIntent();
      return true;
    })().finally(() => { quotationPrefillPromise = null; });
    return quotationPrefillPromise;
  }



  async function applyCustomerAppointmentDefaults(customerId){
    if(!customerId||editingRequestId)return;
    const token=++customerDefaultsSelectionToken;
    const customer=opts.customers.find(item=>String(item.id)===String(customerId));
    if(!customer)return;
    const localNeighborhoodId=matchNeighborhoodId(customer);
    const localMapUrl=String(customer?.google_maps_url||'').trim();
    const localLocationNotes=String(customer?.location_notes||'').trim();
    setInstallationGeoFromNeighborhood('new',localNeighborhoodId||'');
    if($('newInstallationCustomerMapUrl'))$('newInstallationCustomerMapUrl').value=localMapUrl;
    if($('newInstallationCustomerLocationNotes'))$('newInstallationCustomerLocationNotes').value=localLocationNotes;
    try{
      const defaults=await window.InstallationsServiceSafe.customerAppointmentDefaults(customerId);
      if(token!==customerDefaultsSelectionToken || String($('newInstallationCustomerId')?.value||'')!==String(customerId))return;
      const neighborhoodId=matchNeighborhoodId(customer,defaults)||localNeighborhoodId;
      const mapUrl=localMapUrl||defaults?.customerMapUrl||'';
      if(neighborhoodId){
        setInstallationGeoFromNeighborhood('new',neighborhoodId);
        if(!customer?.neighborhood_id){
          try{await window.InstallationsServiceSafe.saveCustomerLocationDefaults?.(customerId,neighborhoodId,mapUrl);customer.neighborhood_id=neighborhoodId;}catch(error){console.warn('[Appointments] Customer neighborhood backfill skipped:',error);}
        }
      }
      if($('newInstallationCustomerMapUrl'))$('newInstallationCustomerMapUrl').value=mapUrl;
      if($('newInstallationCustomerLocationNotes'))$('newInstallationCustomerLocationNotes').value=defaults?.locationNotes??localLocationNotes;
      if(defaults?.quotationId){quotationOptions(customerId,'newInstallationQuotationId',defaults.quotationId);$('newInstallationQuotationId').value=defaults.quotationId;}
      if(defaults?.services?.length){$('newInstallationServicesBody').innerHTML='';defaults.services.forEach(addServiceRow);}
      if($('newInstallationDiscountType'))$('newInstallationDiscountType').value=defaults?.discountType||'amount';
      if($('newInstallationDiscount'))$('newInstallationDiscount').value=Number(defaults?.discountValue||0).toFixed(2);
      if($('newInstallationNotes'))$('newInstallationNotes').value=defaults?.notes||'';
      if(defaults?.animals?.length){$('newInstallationAnimalsBody').innerHTML='';defaults.animals.forEach(addAnimalRow);}
      recalculateServices();
      if(defaults?.collection){
        if($('newInstallationAmountCollected'))$('newInstallationAmountCollected').value=Number(defaults.collection.amountCollected||0).toFixed(2);
        if($('newInstallationCollectionStatus'))$('newInstallationCollectionStatus').value=defaults.collection.collectionStatus||'غير محصل';
        if($('newInstallationPaymentMethod'))$('newInstallationPaymentMethod').value=defaults.collection.paymentMethod||'';
        if($('newInstallationAppointmentStatus'))$('newInstallationAppointmentStatus').value=defaults.collection.appointmentStatus||'بانتظار المراجعة';
      }
    }catch(error){
      console.warn('[Appointments] Historical customer defaults prefill skipped:',error);
      const target=$('newInstallationRequestFormStatus');
      if(target)status(target,'تم تحميل بيانات موقع العميل، لكن تعذر تحميل بيانات آخر موعد: '+(error?.message||'خطأ غير معروف.'),'warning');
    }
  }

  function customerLabel(customer) {
    return [customer.customer_name, customer.phone, customer.customer_number].filter(Boolean).join(" — ");
  }

  function syncCustomerSearch(customerId = "") {
    const hidden = $("newInstallationCustomerId");
    const input = $("newInstallationCustomerSearch");
    if (!hidden || !input) return;
    const customer = opts.customers.find(item => item.id === customerId);
    hidden.value = customer?.id || "";
    input.value = customer ? customerLabel(customer) : "";
    input.setCustomValidity(customer ? "" : (input.value ? "اختر العميل من نتائج البحث." : ""));
  }

  function renderCustomerResults(query = "") {
    const box = $("newInstallationCustomerResults");
    const input = $("newInstallationCustomerSearch");
    if (!box || !input) return;
    const q = String(query || "").trim().toLowerCase();
    const matches = (opts.customers || []).filter(customer => !q || [customer.customer_name, customer.phone, customer.customer_number].join(" ").toLowerCase().includes(q)).slice(0, 50);
    box.innerHTML = matches.length ? matches.map(customer => `<button type="button" class="installation-customer-result" role="option" data-installation-customer-id="${esc(customer.id)}"><strong>${esc(customer.customer_name || "عميل بدون اسم")}</strong><span>${esc(customer.phone || "بدون هاتف")} — ${esc(customer.customer_number || "بدون رقم عميل")}</span></button>`).join("") : '<div class="empty-cell">لا توجد نتائج مطابقة.</div>';
    box.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  }

  function closeCustomerResults() {
    $("newInstallationCustomerResults")?.classList.add("hidden");
    $("newInstallationCustomerSearch")?.setAttribute("aria-expanded", "false");
  }

  function reportOptionLoadWarnings(data) {
    const errors = data?.errors || {};
    const labels = { customers: "العملاء", quotations: "عقود العملاء", regions: "المناطق", cities: "المدن", neighborhoods: "الأحياء", serviceTypes: "الخدمات" };
    const failed = Object.keys(errors).map(key => labels[key] || key);
    const target = $("newInstallationRequestFormStatus");
    if (!failed.length) {
      if (target?.dataset.optionWarning === "true") clearStatus(target);
      if (target) delete target.dataset.optionWarning;
      return;
    }
    if (target) {
      target.dataset.optionWarning = "true";
      status(target, `تعذر تحميل: ${failed.join("، ")}. بقية القوائم متاحة ويمكن إعادة المحاولة.`, "warning");
    }
  }

  function customerOptions(selectId) {
    const node = $(selectId);
    if (!node) return;
    node.innerHTML = '<option value="">اختر العميل</option>' + opts.customers.map(customer =>
      `<option value="${esc(customer.id)}">${esc(customer.customer_name)} — ${esc(customer.phone || "بدون هاتف")}</option>`
    ).join("");
  }

  function quotationOptions(customerId, selectId, includeQuotationId = "") {
    const node = $(selectId);
    if (!node) return;
    const quotes = opts.quotations.filter(quotation => (!customerId || quotation.customer_id === customerId) && quotation.status === 'مقبول' && (!quotation.installation_request_id || String(quotation.id) === String(includeQuotationId)));
    node.innerHTML = '<option value="">بدون عقد</option>' + quotes.map(quotation =>
      `<option value="${esc(quotation.id)}">${esc(quotation.quotation_number)}</option>`
    ).join("");
  }

  const installationGeoControllers = new Map();
  function installationGeoController(scope){
    if(scope==='new')return null;
    if(installationGeoControllers.has(scope))return installationGeoControllers.get(scope);
    if(!window.KYUMGeography)throw new Error('مكوّن العنوان الجغرافي غير محمّل.');
    const prefix='installationServicesEdit';
    const controller=window.KYUMGeography.createController({
      ids:{
        region:{wrapper:prefix+'RegionCombobox',hidden:prefix+'RegionId',search:prefix+'RegionSearch',options:prefix+'RegionOptions'},
        city:{wrapper:prefix+'CityCombobox',hidden:prefix+'CityId',search:prefix+'CitySearch',options:prefix+'CityOptions'},
        district:{wrapper:prefix+'DistrictCombobox',hidden:'installationServicesEditNeighborhood',search:prefix+'DistrictSearch',options:prefix+'DistrictOptions'}
      },
      optionLimit:300,
      boundAttribute:'installationGeoEditUnifiedBound'
    }).bind();
    installationGeoControllers.set(scope,controller);
    return controller;
  }
  function closeAllInstallationGeo(){
    installationGeoControllers.forEach(controller=>['region','city','district'].forEach(type=>controller?.close?.(type)));
  }
  function syncInstallationGeoCatalog(){
    window.KYUMGeography?.setCatalog({regions:opts.regions||[],cities:opts.cities||[],neighborhoods:opts.neighborhoods||[]});
  }
  function newNeighborhoodLabel(item){return String(item?.name||'').trim()}
  function closeNewNeighborhoodResults(){
    $('newInstallationNeighborhoodResults')?.classList.add('hidden');
    $('newInstallationNeighborhoodSearch')?.setAttribute('aria-expanded','false');
  }
  function renderNewNeighborhoodResults(query=''){
    const box=$('newInstallationNeighborhoodResults'),input=$('newInstallationNeighborhoodSearch');
    if(!box||!input)return;
    const q=normalizeArabicText(query);
    const matches=(opts.neighborhoods||[]).filter(item=>!q||normalizeArabicText(item.name).includes(q)).slice(0,250);
    box.innerHTML=matches.length?matches.map(item=>`<button type="button" class="installation-neighborhood-result" role="option" data-installation-neighborhood-id="${esc(item.id)}"><strong>${esc(newNeighborhoodLabel(item))}</strong></button>`).join(''):`<div class="installation-neighborhood-empty">${esc(appointmentT('customers.dialog.noNeighborhoods','لا توجد أحياء مطابقة.'))}</div>`;
    box.classList.remove('hidden');input.setAttribute('aria-expanded','true');
  }
  function setNewNeighborhood(neighborhoodId=''){
    const hidden=$('newInstallationNeighborhoodId'),input=$('newInstallationNeighborhoodSearch');
    if(!hidden||!input)return;
    const item=(opts.neighborhoods||[]).find(x=>String(x.id)===String(neighborhoodId));
    hidden.value=item?.id||'';
    input.value=item?newNeighborhoodLabel(item):'';
    input.setCustomValidity('');
    closeNewNeighborhoodResults();
  }
  function setInstallationGeoFromNeighborhood(scope,neighborhoodId=''){
    if(scope==='new'){setNewNeighborhood(neighborhoodId);return {districtId:neighborhoodId};}
    syncInstallationGeoCatalog();
    return installationGeoController(scope).setValue({districtId:neighborhoodId});
  }
  function neighborhoodOptions(){
    syncInstallationGeoCatalog();
    installationGeoController('edit');
    const current=$('newInstallationNeighborhoodId')?.value||'';
    if(current)setNewNeighborhood(current);
  }

  function serviceTypeOptions(selectedId = "") {
    return `<option value="">${esc(appointmentT('appointmentNew.services.select','اختر نوع الخدمة'))}</option>` + opts.serviceTypes.map(item =>
      `<option value="${esc(item.id)}" ${String(item.id) === String(selectedId) ? "selected" : ""}>${esc(appointmentEntity('service', item.id, item.name))}</option>`
    ).join("");
  }

  function serviceSearchResults(query="", selectedId="") {
    const q=String(query||"").trim().toLocaleLowerCase(window.PetatoeLocalization?.effectiveLanguage?.()==='en'?'en':'ar');
    const rows=(opts.serviceTypes||[]).filter(item=>{const label=appointmentEntity('service',item.id,item.name);return !q||String(label||"").toLocaleLowerCase().includes(q)}).slice(0,80);
    return rows.length?rows.map(item=>`<button type="button" role="option" aria-selected="${String(item.id)===String(selectedId)}" class="installation-service-search-option ${String(item.id)===String(selectedId)?"is-selected":""}" data-service-id="${esc(item.id)}"><span>${esc(appointmentEntity('service',item.id,item.name))}</span><small>${money(item.default_price||0)}</small></button>`).join(""):`<div class="installation-service-search-empty">${esc(appointmentT('appointmentNew.services.noMatch','لا توجد خدمة مطابقة للبحث.'))}</div>`;
  }
  const servicePickerDesktopQuery="(min-width:1024px) and (min-device-width:1025px) and (hover:hover) and (pointer:fine)";
  let activeServicePickerRow=null;
  let stopServicePickerTracking=null;
  let servicePickerAnchorSeq=0;
  function isDesktopServicePicker(){
    try{return window.matchMedia(servicePickerDesktopQuery).matches}catch(_){return false}
  }
  function supportsServicePickerAnchor(){
    try{return isDesktopServicePicker()&&!!window.CSS?.supports?.("anchor-name: --petatoe-service-anchor")&&CSS.supports("position-anchor: --petatoe-service-anchor")}catch(_){return false}
  }
  function clearServicePickerTracking(row=null){
    if(row&&activeServicePickerRow&&row!==activeServicePickerRow)return;
    if(typeof stopServicePickerTracking==="function")stopServicePickerTracking();
    stopServicePickerTracking=null;
    const active=activeServicePickerRow;
    activeServicePickerRow=null;
    const panel=active?.querySelector(".installation-service-search-results"),button=active?.querySelector(".installation-service-select");
    if(panel){panel.style.removeProperty("position-anchor");panel.style.removeProperty("left");panel.style.removeProperty("top");panel.style.removeProperty("width");panel.style.removeProperty("max-height")}
    if(button)button.style.removeProperty("anchor-name");
  }
  function closeServicePicker(row) {
    const panel=row?.querySelector(".installation-service-search-results"),button=row?.querySelector(".installation-service-select");
    if(!panel)return;
    clearServicePickerTracking(row);
    try{if(panel.matches(":popover-open"))panel.hidePopover()}catch(_){/* fallback below */}
    panel.classList.add("hidden");
    if(button)button.setAttribute("aria-expanded","false");
  }
  function closeAllServicePickers(exceptRow=null){
    document.querySelectorAll("#newInstallationServicesBody .installation-service-entry").forEach(row=>{if(row!==exceptRow)closeServicePicker(row)});
  }
  function positionServicePicker(row){
    const panel=row?.querySelector(".installation-service-search-results"),button=row?.querySelector(".installation-service-select");
    if(!panel||!button)return;
    const rect=button.getBoundingClientRect();
    const margin=12;
    const width=Math.min(Math.max(rect.width,320),Math.max(280,window.innerWidth-margin*2));
    let left=Math.min(Math.max(margin,rect.right-width),Math.max(margin,window.innerWidth-width-margin));
    let top=rect.bottom+6;
    const maxHeight=Math.min(320,Math.max(180,window.innerHeight-margin*2));
    if(top+maxHeight>window.innerHeight-margin)top=Math.max(margin,rect.top-maxHeight-6);
    panel.style.left=`${Math.round(left)}px`;
    panel.style.top=`${Math.round(top)}px`;
    panel.style.width=`${Math.round(width)}px`;
    panel.style.maxHeight=`${Math.round(maxHeight)}px`;
  }
  function bindServicePickerToTrigger(row){
    clearServicePickerTracking();
    activeServicePickerRow=row;
    const panel=row?.querySelector(".installation-service-search-results"),button=row?.querySelector(".installation-service-select");
    if(!panel||!button)return;
    if(supportsServicePickerAnchor()){
      const anchorName=`--petatoe-service-picker-${++servicePickerAnchorSeq}`;
      button.style.setProperty("anchor-name",anchorName);
      panel.style.setProperty("position-anchor",anchorName);
      return;
    }
    positionServicePicker(row);
    if(!isDesktopServicePicker())return;
    const reposition=()=>{if(activeServicePickerRow===row&&!panel.classList.contains("hidden"))positionServicePicker(row)};
    window.addEventListener("scroll",reposition,true);
    window.addEventListener("resize",reposition);
    window.visualViewport?.addEventListener("scroll",reposition);
    window.visualViewport?.addEventListener("resize",reposition);
    stopServicePickerTracking=()=>{
      window.removeEventListener("scroll",reposition,true);
      window.removeEventListener("resize",reposition);
      window.visualViewport?.removeEventListener("scroll",reposition);
      window.visualViewport?.removeEventListener("resize",reposition);
    };
  }
  function openServicePicker(row){
    if(!row)return;
    closeAllServicePickers(row);
    const hidden=row.querySelector(".installation-service-type"),panel=row.querySelector(".installation-service-search-results"),search=row.querySelector(".installation-service-search"),options=row.querySelector(".installation-service-search-options"),button=row.querySelector(".installation-service-select");
    if(!panel||!search||!options)return;
    search.value="";
    options.innerHTML=serviceSearchResults("",hidden?.value||"");
    panel.classList.remove("hidden");
    bindServicePickerToTrigger(row);
    try{if(typeof panel.showPopover==="function"&&!panel.matches(":popover-open"))panel.showPopover()}catch(_){/* CSS fallback remains visible */}
    if(button)button.setAttribute("aria-expanded","true");
    requestAnimationFrame(()=>search.focus({preventScroll:true}));
  }
  function setServiceSearchValue(row,serviceId="") {
    const hidden=row?.querySelector(".installation-service-type"),label=row?.querySelector(".installation-service-select-label");
    if(!hidden||!label)return;
    const item=(opts.serviceTypes||[]).find(x=>String(x.id)===String(serviceId));
    hidden.value=item?.id||serviceId||"";
    label.textContent=item?.name||(serviceId?"خدمة محفوظة غير نشطة":"اختر نوع الخدمة");
    hidden.setCustomValidity(hidden.value?"":"اختر نوع الخدمة");
  }
  function hydrateServiceRows() {
    document.querySelectorAll("#newInstallationServicesBody .installation-service-entry").forEach(row => {
      const hidden=row.querySelector(".installation-service-type");
      if(!hidden)return;
      const currentValue=hidden.value||hidden.dataset.pendingServiceTypeId||"";
      setServiceSearchValue(row,currentValue);
      delete hidden.dataset.pendingServiceTypeId;
    });
  }

  function formatAppointmentTime(value) {
    if (!value) return "—";
    const parts = String(value).slice(0,5).split(":");
    const hour = Number(parts[0]);
    const minute = parts[1] || "00";
    if (!Number.isFinite(hour)) return String(value);
    const lang = window.PetatoeLocalization?.getLanguage?.() || document.documentElement.lang || 'ar';
    if (lang === 'en') {
      if (hour === 0) return `12:${minute} AM`;
      if (hour < 12) return `${hour}:${minute} AM`;
      if (hour === 12) return `12:${minute} PM`;
      return `${hour - 12}:${minute} PM`;
    }
    if (hour === 12) return `12:${minute} ظهرًا`;
    if (hour < 12) return `${hour}:${minute} صباحًا`;
    return `${hour - 12}:${minute} مساءً`;
  }

  const INSTALLATION_OVERDUE_FILTER = "overdue";
  const INSTALLATION_OVERDUE_NOT_STARTED_STATUSES = new Set(["مجدول", "مسند"]);

  function installationScheduledDayStart(row) {
    const dateMatch = String(row?.scheduledDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) return null;
    const year = Number(dateMatch[1]), month = Number(dateMatch[2]) - 1, day = Number(dateMatch[3]);
    return new Date(year, month, day, 0, 0, 0, 0).getTime();
  }

  function isInstallationRequestOverdue(row, nowMs = Date.now()) {
    if (!row?.scheduledDate || !INSTALLATION_OVERDUE_NOT_STARTED_STATUSES.has(row.status)) return false;
    const scheduledDayStart = installationScheduledDayStart(row);
    if (!Number.isFinite(scheduledDayStart)) return false;
    const now = new Date(nowMs);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    return scheduledDayStart < todayStart;
  }

  function filtered() {
    const query = ($("installationRequestSearch")?.value || "").trim().toLowerCase();
    const team = $("installationRequestRepresentativeFilter")?.value || "";
    const state = $("installationRequestStatusFilter")?.value || "";
    const dateFrom = $("installationRequestDateFrom")?.value || "";
    const dateTo = $("installationRequestDateTo")?.value || "";
    const nowMs = Date.now();
    return rows.filter(row =>
      (!query || [row.requestNumber, row.customerName, row.customerPhone, row.quotationNumber, row.services.map(service => service.serviceName).join(" ")].join(" ").toLowerCase().includes(query)) &&
      (!team || row.teamId === team) &&
      (!state || (state === INSTALLATION_OVERDUE_FILTER ? isInstallationRequestOverdue(row, nowMs) : row.status === state)) &&
      (!dateFrom || row.scheduledDate >= dateFrom) &&
      (!dateTo || row.scheduledDate <= dateTo)
    );
  }

  function render() {
    const data = filtered();
    const nowMs = Date.now();
    $("installationKpiTotal").textContent = rows.length;
    $("installationKpiScheduled").textContent = rows.filter(row => ["مجدول", "مسند"].includes(row.status)).length;
    $("installationKpiInProgress").textContent = rows.filter(row => ["في الطريق", "وصل إلى العميل", "قيد التنفيذ"].includes(row.status)).length;
    $("installationKpiOverdue").textContent = rows.filter(row => isInstallationRequestOverdue(row, nowMs)).length;

    $("installationRequestsBody").innerHTML = data.length ? data.map(row => {
      const serviceSummary = row.services.length
        ? row.services.map(service => `<div class="installation-service-detail"><strong>${esc(appointmentEntity('service',service.serviceTypeId||service.service_type_id||service.id,service.serviceName||service.name||appointmentT('appointments.common.service','خدمة')))}</strong><small>${service.quantity} × ${money(vatAmount(service.unitPrice))} = ${money(vatServiceLine(service))}</small></div>`).join("")
        : "—";
      return `<tr>
        <td>${esc(row.requestNumber)}</td>
        <td><strong>${esc(row.customerName)}</strong><br><small>${esc(row.customerPhone)}</small></td>
        <td>${esc(row.quotationNumber || appointmentT('appointmentNew.customer.noContract','بدون عقد'))}</td>
        <td>${serviceSummary}</td>
        <td>${money(row.finalAmount || row.totalServicesAmount)}</td>
        <td>${esc(row.installationAddress || row.district || "—")}</td>
        <td>${esc(row.scheduledDate || appointmentT('appointments.common.notSpecified','غير محدد'))}</td>
        <td>${esc(row.scheduledTime ? formatAppointmentTime(row.scheduledTime) : (row.timeSlot || "—"))}</td>
        <td><span class="installation-status-badge" data-status="${esc(row.status)}">${esc(appointmentStatusLabel(row.status))}</span></td>
        <td>${esc(row.teamName || "—")}</td>
        <td><div class="installation-row-actions"><button class="secondary-btn" data-install-view="${row.id}" type="button">${esc(appointmentT("appointments.common.view","عرض"))}</button><button class="secondary-btn" data-install-services-edit="${row.id}" type="button">${esc(appointmentT("appointments.common.editServices","تعديل الخدمات"))}</button><button class="danger-btn" data-install-delete="${row.id}" type="button">${esc(appointmentT("appointments.common.delete","حذف"))}</button></div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="11" class="empty-cell">${esc(appointmentT('appointments.requests.empty','لا توجد مواعيد مطابقة.'))}</td></tr>`;

    const mobileCards = $("installationRequestsMobileCards");
    if (mobileCards) {
      mobileCards.innerHTML = data.length ? data.map(row => {
        const services = (row.services || []).map(service => `<div class="installation-mobile-service"><strong>${esc(appointmentEntity('service',service.serviceTypeId||service.service_type_id||service.id,service.serviceName||service.name||appointmentT('appointments.common.service','خدمة')))}</strong><small>${Number(service.quantity||0)} × ${money(vatAmount(service.unitPrice))}</small><b>${money(vatServiceLine(service))}</b></div>`).join("") || `<div class="installation-mobile-empty">${esc(appointmentT('appointments.common.noServices','لا توجد خدمات'))}</div>`;
        const when = [row.scheduledDate || appointmentT('appointments.common.notSpecified','غير محدد'), row.scheduledTime ? formatAppointmentTime(row.scheduledTime) : (row.timeSlot || '')].filter(Boolean).join(' — ');
        return `<article class="installation-request-mobile-card" data-install-mobile-card="${esc(row.id)}">
          <div class="installation-request-mobile-head"><div><small>${esc(appointmentT('appointments.requests.appointmentNumber','رقم الموعد'))}</small><strong>${esc(row.requestNumber)}</strong></div><span class="installation-status-badge" data-status="${esc(row.status)}">${esc(appointmentStatusLabel(row.status))}</span></div>
          <div class="installation-request-mobile-customer"><strong>${esc(row.customerName||'—')}</strong><a href="tel:${esc(String(row.customerPhone||'').replace(/[^+\d]/g,''))}">${esc(row.customerPhone||'—')}</a><small>${esc(row.installationAddress||row.district||'—')}</small></div>
          <div class="installation-request-mobile-meta"><div><span>${esc(appointmentT('appointments.requests.contract','العقد'))}</span><strong>${esc(row.quotationNumber||'بدون عقد')}</strong></div><div><span>${esc(appointmentT('appointments.requests.appointment','الموعد'))}</span><strong>${esc(when)}</strong></div><div><span>${esc(appointmentT('appointments.common.team','الفرقة'))}</span><strong>${esc(row.teamName||'—')}</strong></div><div><span>${esc(appointmentT('appointments.requests.totalVat','الإجمالي شامل الضريبة'))}</span><strong>${money(row.finalAmount||row.totalServicesAmount)}</strong></div></div>
          <div class="installation-request-mobile-services"><span>${esc(appointmentT('appointmentNew.services.title','الخدمات'))}</span>${services}</div>
          <div class="installation-request-mobile-actions"><button class="secondary-btn" data-install-view="${row.id}" type="button">${esc(appointmentT("appointments.common.view","عرض"))}</button><button class="secondary-btn" data-install-services-edit="${row.id}" type="button">${esc(appointmentT("appointments.common.editServices","تعديل الخدمات"))}</button><button class="danger-btn" data-install-delete="${row.id}" type="button">${esc(appointmentT("appointments.common.delete","حذف"))}</button></div>
        </article>`;
      }).join('') : `<div class="installation-mobile-empty-state">${esc(appointmentT('appointments.requests.empty','لا توجد مواعيد مطابقة.'))}</div>`;
    }
  }

  async function ensureOptions(force = false) {
    if (!force && optionsLoaded) {
      hydrateServiceRows();
      return;
    }
    opts = await window.InstallationsServiceSafe.options();
    optionsLoaded = true;
    customerOptions("installationCustomerId");
    quotationOptions("", "installationQuotationId");
    syncCustomerSearch("");
    quotationOptions("", "newInstallationQuotationId");
    neighborhoodOptions();
    if(!$('newInstallationNeighborhoodId')?.value)setInstallationGeoFromNeighborhood('new','');
    hydrateServiceRows();
    reportOptionLoadWarnings(opts);
  }

  async function load() {
    status($("installationRequestsStatus"), appointmentT('appointments.requests.loading','جاري تحميل المواعيد...'));
    try {
      [rows, opts] = await Promise.all([window.InstallationsServiceSafe.list(), window.InstallationsServiceSafe.options()]);
      customerOptions("installationCustomerId");
      reportOptionLoadWarnings(opts);
      const teamFilter = $("installationRequestRepresentativeFilter");
      if (teamFilter) {
        const current = teamFilter.value;
        const teams = [...new Map(rows.filter(row => row.teamId).map(row => [row.teamId, row.teamName || appointmentT('appointments.common.team','الفرقة')])).entries()];
        teamFilter.innerHTML = `<option value="">${esc(appointmentT('appointments.common.allTeams','كل الفرق'))}</option>` + teams.map(([id,name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
        teamFilter.value = teams.some(([id]) => id === current) ? current : "";
      }
      render();
      clearStatus($("installationRequestsStatus"));
    } catch (error) {
      status($("installationRequestsStatus"), error.message, "error");
      $("installationRequestsBody").innerHTML = '<tr><td colspan="11" class="empty-cell">تعذر تحميل البيانات.</td></tr>';
    }
  }

  async function openEdit(row) {
    if (!row) return;
    try {
      editingRequestId = row.id;
      await ensureOptions(true);
      row = await window.InstallationsServiceSafe.requestEditDetail(row.id);
      const opened = window.KYUMNavigation?.open?.("installationRequestNew", { trustedNavigation: true });
      if (opened === false) throw new Error("ليس لديك صلاحية فتح شاشة بيانات الموعد.");

      quotationOptions(row.customerId, "newInstallationQuotationId", row.quotationId || "");
      neighborhoodOptions();

      $("newInstallationRequestHeading").textContent = "تعديل الموعد";
      $("newInstallationRequestNote").textContent = `عدّل بيانات الموعد ${row.requestNumber}. بيانات الجدولة الحالية والملاحظات محمّلة كما هي، وأي حقل لا تغيّره سيظل دون تغيير.`;
      $("saveNewInstallationRequest").textContent = "حفظ التعديلات";
      $("resetNewInstallationRequest").textContent = "استعادة البيانات";

      syncCustomerSearch(row.customerId || "");
      quotationOptions(row.customerId, "newInstallationQuotationId", row.quotationId || "");
      $("newInstallationQuotationId").value = row.quotationId || "";
      setInstallationGeoFromNeighborhood('new', row.neighborhoodId || '');
      $("newInstallationCustomerMapUrl").value = row.customerMapUrl || "";
      let customerLocationNotes = row.customerLocationNotes || "";
      try {
        const customerDefaults = await window.InstallationsServiceSafe.customerAppointmentDefaults(row.customerId);
        customerLocationNotes = customerDefaults?.locationNotes ?? customerLocationNotes;
      } catch (error) {
        console.warn('[Appointments] Customer location notes edit prefill skipped:', error);
      }
      if ($("newInstallationCustomerLocationNotes")) $("newInstallationCustomerLocationNotes").value = customerLocationNotes || "";
      $("newInstallationNotes").value = row.notes || "";
      $("newInstallationDiscountType").value = row.discountType || "amount";
      $("newInstallationDiscount").value = Number(row.discountValue ?? row.discountAmount ?? 0).toFixed(2);
      $("newInstallationServicesBody").innerHTML = "";
      (row.services?.length ? row.services : [{}]).forEach(addServiceRow);
      $("newInstallationAnimalsBody").innerHTML = "";
      (row.animals?.length ? row.animals : [{}]).forEach(addAnimalRow);
      $("newInstallationAmountCollected").value = Number(row.collection?.amountCollected || 0).toFixed(2);
      $("newInstallationCollectionStatus").value = row.collection?.collectionStatus || "غير محصل";
      $("newInstallationPaymentMethod").value = row.collection?.paymentMethod || "";
      $("newInstallationAppointmentStatus").value = row.collection?.appointmentStatus || row.status || "بانتظار المراجعة";
      const editSchedule={scheduledDate:row.scheduledDate||"",scheduledTime:String(row.scheduledTime||"").slice(0,5),teamId:row.teamId||"",technicianName:row.technicianName||""};
      if($("newInstallationScheduleDate"))$("newInstallationScheduleDate").value=editSchedule.scheduledDate;
      if($("newInstallationScheduleTime"))$("newInstallationScheduleTime").value=editSchedule.scheduledTime;
      if($("newInstallationScheduleTeam"))$("newInstallationScheduleTeam").value=editSchedule.teamId;
      if($("newInstallationScheduleTechnician"))$("newInstallationScheduleTechnician").value=editSchedule.technicianName;
      editingScheduleSnapshot={...editSchedule};
      recalculateServices();
      clearStatus($("newInstallationRequestFormStatus"));
    } catch (error) {
      editingRequestId = null;
      status($("installationRequestsStatus"), error.message, "error");
    }
  }

  function addServiceRow(initial = {}) {
    const body=$("newInstallationServicesBody");if(!body)return;
    const row=document.createElement("tr");row.className="installation-service-entry";
    row.innerHTML=`
      <td><div class="installation-service-searchbox"><input class="installation-service-type" type="text" tabindex="-1" aria-hidden="true" data-pending-service-type-id="${esc(initial.serviceTypeId||"")}" value="${esc(initial.serviceTypeId||"")}"><button class="installation-service-select" type="button" aria-haspopup="listbox" aria-expanded="false"><span class="installation-service-select-label">${esc(appointmentT('appointmentNew.services.select','اختر نوع الخدمة'))}</span><span class="installation-service-select-arrow" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button><div class="installation-service-search-results hidden" popover="manual"><div class="installation-service-search-head"><input class="installation-service-search" type="search" autocomplete="off" placeholder="${esc(appointmentT('appointmentNew.services.search','ابحث عن خدمة...'))}" aria-label="${esc(appointmentT('appointmentNew.services.searchAria','البحث في الخدمات'))}"></div><div class="installation-service-search-options" role="listbox"></div></div></div></td>
      <td><input class="installation-service-quantity" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(latinDigits(initial.quantity||1))}" required></td>
      <td><input class="installation-service-price" type="text" inputmode="decimal" pattern="[0-9]+(?:\.[0-9]{0,2})?" value="${esc(latinDigits(initial.unitPrice??0))}" required></td>
      <td><output class="installation-service-line-total">${money((initial.quantity||1)*(initial.unitPrice||0))}</output></td>
      <td><button type="button" class="danger-btn installation-service-remove">${esc(appointmentT('appointmentNew.services.remove','حذف'))}</button></td>`;
    body.appendChild(row);if(optionsLoaded)hydrateServiceRows();recalculateServices();
  }

  function currentFinancials(){
    let quantity=0,subtotal=0;
    document.querySelectorAll('#newInstallationServicesBody .installation-service-entry').forEach(row=>{
      const qty=Math.max(0,Number(row.querySelector('.installation-service-quantity')?.value||0));
      const price=Math.max(0,Number(row.querySelector('.installation-service-price')?.value||0));
      quantity+=qty;subtotal+=qty*price;
    });
    const discountType=$('newInstallationDiscountType')?.value==='percentage'?'percentage':'amount';
    const requestedDiscount=Math.max(0,Number($('newInstallationDiscount')?.value||0));
    const tax=Math.round(subtotal*0.15*100)/100;
    const gross=Math.round((subtotal+tax)*100)/100;
    const discountValue=discountType==='percentage'?Math.min(requestedDiscount,100):requestedDiscount;
    const discount=Math.min(discountType==='percentage'?Math.round(gross*discountValue/100*100)/100:discountValue,gross);
    const final=Math.round((gross-discount)*100)/100;
    return {quantity,subtotal,taxRate:15,tax,gross,discountType,discountValue,discount,final};
  }

  function recalculateServices() {
    document.querySelectorAll('#newInstallationServicesBody .installation-service-entry').forEach(row=>{
      const qty=Math.max(0,Number(row.querySelector('.installation-service-quantity')?.value||0));
      const price=Math.max(0,Number(row.querySelector('.installation-service-price')?.value||0));
      const output=row.querySelector('.installation-service-line-total');
      if(output)output.textContent=money(qty*price);
    });
    const totals=currentFinancials();
    const discountInput=$('newInstallationDiscount');
    const discountLabel=$('newInstallationDiscountLabel');
    if(discountInput){
      discountInput.max=totals.discountType==='percentage'?'100':String(totals.gross.toFixed(2));
      discountInput.step=totals.discountType==='percentage'?'0.01':'0.01';
      if(totals.discountType==='percentage'&&Number(discountInput.value||0)>100)discountInput.value='100';
      if(totals.discountType==='amount'&&Number(discountInput.value||0)>totals.gross)discountInput.value=totals.gross.toFixed(2);
    }
    if(discountLabel)discountLabel.textContent=totals.discountType==='percentage'?appointmentT('appointmentNew.discount.percentageLabel','نسبة الخصم (%)'):appointmentT('appointmentNew.discount.amountLabel','قيمة الخصم (SAR)');
    $('newInstallationTotalQuantity').textContent=String(totals.quantity);
    $('newInstallationSubtotal').textContent=money(totals.subtotal);
    $('newInstallationDiscountTotal').textContent=money(totals.discount);
    $('newInstallationTaxAmount').textContent=money(totals.tax);
    $('newInstallationGrandTotal').textContent=money(totals.final);
    if($('newInstallationSessionValue'))$('newInstallationSessionValue').value=money(totals.final);
    if($('newInstallationCollectionDiscount'))$('newInstallationCollectionDiscount').value=money(totals.discount);
    return totals;
  }

  function collectServices() {
    return [...document.querySelectorAll('#newInstallationServicesBody .installation-service-entry')].map(row => ({
      serviceTypeId: row.querySelector('.installation-service-type')?.value || '',
      quantity: Number(row.querySelector('.installation-service-quantity')?.value || 0),
      unitPrice: Number(row.querySelector('.installation-service-price')?.value || 0)
    }));
  }

  function breedOptions(petType,selected=''){const rows=(opts.breeds||[]).filter(x=>x.pet_type===petType&&x.is_active!==false);const has=rows.some(x=>x.name===selected);return `<option value="">${esc(appointmentT('appointmentNew.animals.selectBreed','اختر السلالة'))}</option>`+(!has&&selected?`<option value="${esc(selected)}" selected>${esc(selected)} — ${esc(appointmentT('appointmentNew.animals.saved','محفوظ سابقًا'))}</option>`:'')+rows.map(x=>`<option value="${esc(x.name)}" ${x.name===selected?'selected':''}>${esc(x.name)}</option>`).join('')}
  function syncBreedSelect(row,selected=''){const type=row.querySelector('.appointment-animal-type')?.value||'';const sel=row.querySelector('.appointment-animal-breed');if(sel)sel.innerHTML=breedOptions(type,selected||sel.value)}
  function addAnimalRow(initial={}){
    const body=$('newInstallationAnimalsBody');if(!body)return;
    const row=document.createElement('tr');row.className='appointment-animal-entry';
    row.innerHTML=`
      <td><input class="appointment-animal-name" type="text" maxlength="120" value="${esc(initial.petName||'')}" placeholder="Max"></td>
      <td><select class="appointment-animal-type"><option value="">${esc(appointmentT('appointmentNew.animals.selectType','اختر النوع'))}</option><option value="كلب" ${initial.petType==='كلب'?'selected':''}>${esc(appointmentT('appointmentNew.animals.dog','كلب'))}</option><option value="قط" ${initial.petType==='قط'?'selected':''}>${esc(appointmentT('appointmentNew.animals.cat','قط'))}</option><option value="أخرى" ${initial.petType==='أخرى'?'selected':''}>${esc(appointmentT('appointmentNew.animals.other','أخرى'))}</option></select></td>
      <td><select class="appointment-animal-breed">${breedOptions(initial.petType||'',initial.breed||'')}</select></td>
      <td><select class="appointment-animal-size"><option value="">${esc(appointmentT('appointmentNew.animals.selectSize','اختر الحجم'))}</option><option value="صغير" ${initial.petSize==='صغير'?'selected':''}>${esc(appointmentT('appointmentNew.animals.small','صغير'))}</option><option value="متوسط" ${initial.petSize==='متوسط'?'selected':''}>${esc(appointmentT('appointmentNew.animals.medium','متوسط'))}</option><option value="كبير" ${initial.petSize==='كبير'?'selected':''}>${esc(appointmentT('appointmentNew.animals.large','كبير'))}</option></select></td>
      <td><input class="appointment-animal-quantity" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(latinDigits(initial.quantity||1))}"></td>
      <td><button type="button" class="danger-btn appointment-animal-remove">${esc(appointmentT('appointmentNew.services.remove','حذف'))}</button></td>`;
    body.appendChild(row);
  }

  function collectAnimals(){
    return [...document.querySelectorAll('#newInstallationAnimalsBody .appointment-animal-entry')].map(row=>({
      petName:String(row.querySelector('.appointment-animal-name')?.value||'').trim(),
      petType:String(row.querySelector('.appointment-animal-type')?.value||'').trim(),
      breed:String(row.querySelector('.appointment-animal-breed')?.value||'').trim(),
      petSize:String(row.querySelector('.appointment-animal-size')?.value||'').trim(),
      quantity:Math.max(1,Number(row.querySelector('.appointment-animal-quantity')?.value||1))
    })).filter(item=>item.petName||item.petType||item.breed||item.petSize);
  }

  function collectCollection(){
    const amount=Math.max(0,Number($('newInstallationAmountCollected')?.value||0));
    return {
      amountCollected:amount,
      collectionStatus:$('newInstallationCollectionStatus')?.value||'غير محصل',
      paymentMethod:$('newInstallationPaymentMethod')?.value||'',
      appointmentStatus:'بانتظار المراجعة'
    };
  }

  function inlineServiceOptions(selected=""){return '<option value="">اختر الخدمة</option>'+opts.serviceTypes.map(item=>`<option value="${esc(item.id)}" ${item.id===selected?'selected':''}>${esc(item.name)}</option>`).join('')}
  function renderRequestView(row){
    if(!row)return;
    $("installationRequestViewLabel").textContent=`${row.requestNumber} — ${row.customerName}`;
    const services=(row.services||[]).map(service=>`<div class="installation-view-service-row"><strong>${esc(appointmentEntity('service',service.serviceTypeId||service.service_type_id||service.id,service.serviceName||service.name||appointmentT('appointments.common.service','خدمة')))}</strong><span>${Number(service.quantity||0)} × ${money(vatAmount(service.unitPrice))}</span><span>${money(vatServiceLine(service))}</span></div>`).join('')||'<p>لا توجد خدمات.</p>';
    const animals=(row.animals||[]).map(animal=>`<div class="installation-view-service-row"><strong>${esc(animal.petName||'حيوان')}</strong><span>${esc([animal.petType,animal.breed,animal.petSize].filter(Boolean).join(' — ')||'—')}</span><span>العدد: ${Number(animal.quantity||1)}</span></div>`).join('')||'<p>لا توجد بيانات حيوان مسجلة.</p>';
    const collection=row.collection||{};
    $("installationRequestViewContent").innerHTML=`<div class="installation-request-view-grid">
      <div><span>رقم الموعد</span><strong>${esc(row.requestNumber)}</strong></div>
      <div><span>اسم العميل</span><strong>${row.customerMasked===true?'بيانات العميل محجوبة':esc(row.customerName||'—')}</strong></div>
      <div><span>رقم العميل</span><strong>${row.customerMasked===true?'محجوب':esc(row.customerPhone||'—')}</strong></div>
      <div><span>رقم العقد</span><strong>${esc(row.quotationNumber||'بدون عقد')}</strong></div>
      <div><span>المندوب</span><strong>${esc(row.representativeName||'—')}</strong></div>
      <div><span>الحي</span><strong>${esc(row.installationAddress||row.district||'—')}</strong></div>
      <div><span>الحالة</span><strong>${esc(row.status||'—')}</strong></div>
      <div><span>تاريخ الموعد</span><strong>${esc(row.scheduledDate||'غير محدد')} ${row.scheduledTime?`— ${esc(row.scheduledTime)}`:''}</strong></div>
      <div><span>الإجمالي شامل الضريبة قبل الخصم</span><strong>${money(Number(row.totalServicesAmount||0)+Number(row.taxAmount||0))}</strong></div>
      <div><span>الخصم</span><strong>${money(row.discountAmount)}</strong></div>
      <div><span>ضريبة 15%</span><strong>${money(row.taxAmount)}</strong></div>
      <div><span>الإجمالي النهائي</span><strong>${money(row.finalAmount||row.totalServicesAmount)}</strong></div>
      <div><span>المبلغ المحصل</span><strong>${money(collection.amountCollected||0)}</strong></div>
      <div><span>حالة التحصيل</span><strong>${esc(collection.collectionStatus||'غير محصل')}</strong></div>
      <div><span>طريقة الدفع</span><strong>${esc(collection.paymentMethod||'—')}</strong></div>
      <div><span>ملاحظات</span><strong>${esc(row.notes||'—')}</strong></div>
    </div><section class="installation-view-services"><h4>الخدمات</h4>${services}</section><section class="installation-view-services"><h4>بيانات الحيوان</h4>${animals}</section>`;
    $("installationRequestViewDialog").showModal();
  }

  function addInlineServiceRow(initial={}){const body=$("installationServicesEditBody");const tr=document.createElement('tr');tr.className='installation-inline-service-row';tr.innerHTML=`<td data-label="الخدمة"><select class="inline-service-type" required>${inlineServiceOptions(initial.serviceTypeId||initial.id||'')}</select></td><td data-label="العدد"><input class="inline-service-quantity" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(latinDigits(initial.quantity||1))}" required></td><td data-label="سعر الوحدة"><input class="inline-service-price" type="text" inputmode="decimal" pattern="[0-9]+(?:\.[0-9]{0,2})?" value="${esc(latinDigits(initial.unitPrice??0))}" required></td><td data-label="الإجمالي"><output class="inline-service-total">${money((initial.quantity||1)*(initial.unitPrice||0))}</output></td><td data-label="إجراء"><button class="danger-btn inline-service-remove" type="button">حذف</button></td>`;body.appendChild(tr);recalculateInlineServices()}
  function recalculateInlineServices(){let q=0,t=0;document.querySelectorAll('#installationServicesEditBody .installation-inline-service-row').forEach(row=>{const qty=Math.max(0,Number(row.querySelector('.inline-service-quantity').value||0)),price=Math.max(0,Number(row.querySelector('.inline-service-price').value||0)),line=qty*price;q+=qty;t+=line;row.querySelector('.inline-service-total').textContent=money(line)});$("installationInlineTotalQuantity").textContent=String(q);$("installationInlineGrandTotal").textContent=money(t)}
  function collectInlineServices(){return [...document.querySelectorAll('#installationServicesEditBody .installation-inline-service-row')].map(row=>({serviceTypeId:row.querySelector('.inline-service-type').value,quantity:Number(row.querySelector('.inline-service-quantity').value||0),unitPrice:Number(row.querySelector('.inline-service-price').value||0)}))}
  function inlineNeighborhoodOptions(selected=""){return '<option value="">اختر الحي</option>'+opts.neighborhoods.map(item=>`<option value="${esc(item.id)}" ${String(item.id)===String(selected)?'selected':''}>${esc(item.name)}</option>`).join('')}
  function inlineQuotationOptions(customerId,selected=""){const rows=opts.quotations.filter(item=>String(item.customer_id||'')===String(customerId||'')&&(item.status==='مقبول'||String(item.id)===String(selected)));return '<option value="">بدون عقد</option>'+rows.map(item=>`<option value="${esc(item.id)}" ${String(item.id)===String(selected)?'selected':''}>${esc(item.quotation_number||'عقد')}</option>`).join('')}
  function syncInlineMapLink(){const input=$("installationServicesEditMapUrl"),link=$("installationServicesEditOpenMap");if(!input||!link)return;const value=String(input.value||'').trim();if(/^https:\/\//i.test(value)){link.href=value;link.classList.remove('hidden')}else{link.href='#';link.classList.add('hidden')}}
  async function ensureInlineEditOptions(customerId){
    const needsNeighborhoods=!opts.neighborhoods?.length,needsGeo=!opts.regions?.length||!opts.cities?.length,needsServices=!opts.serviceTypes?.length;
    const hasCustomerQuotes=(opts.quotations||[]).some(item=>String(item.customer_id||'')===String(customerId||''));
    if(!needsNeighborhoods&&!needsGeo&&!needsServices&&hasCustomerQuotes)return;
    const data=await window.InstallationsServiceSafe.requestEditOptions(customerId);
    if(data.regions?.length)opts.regions=data.regions;
    if(data.cities?.length)opts.cities=data.cities;
    if(needsNeighborhoods||data.neighborhoods?.length)opts.neighborhoods=data.neighborhoods||opts.neighborhoods||[];
    if(needsServices)opts.serviceTypes=data.serviceTypes||[];
    neighborhoodOptions();
    const others=(opts.quotations||[]).filter(item=>String(item.customer_id||'')!==String(customerId||''));
    opts.quotations=[...others,...(data.quotations||[])];
  }
  function renderServicesEditData(row){
    $("installationServicesEditRequestId").value=row.id;
    $("installationServicesEditLabel").textContent=`${row.requestNumber} — ${row.customerName}`;
    setInstallationGeoFromNeighborhood('edit',row.neighborhoodId||'');
    $("installationServicesEditMapUrl").value=row.customerMapUrl||'';
    $("installationServicesEditCustomerOrder").value=row.customerOrderNumber||'';
    const quotation=$("installationServicesEditQuotation");
    quotation.innerHTML=inlineQuotationOptions(row.customerId,row.quotationId||'');
    quotation.value=row.quotationId||'';
    syncInlineMapLink();
    $("installationServicesEditBody").innerHTML='';
    (row.services?.length?row.services:[{}]).forEach(addInlineServiceRow);
    clearStatus($("installationServicesEditStatus"));
  }
  async function openServicesEdit(input){
    const id=input?.id||input;
    if(!id)return;
    const dialog=$("installationServicesEditDialog"),save=$("saveInstallationServicesEdit");
    $("installationServicesEditRequestId").value=id;
    $("installationServicesEditLabel").textContent='جاري تحميل بيانات الطلب...';
    $("installationServicesEditBody").innerHTML='<tr><td colspan="5" class="empty-cell">جاري تحميل البيانات الحالية...</td></tr>';
    save.disabled=true;clearStatus($("installationServicesEditStatus"));
    if(!dialog.open)dialog.showModal();
    try{
      const row=await window.InstallationsServiceSafe.requestEditDetail(id);
      await ensureInlineEditOptions(row.customerId);
      renderServicesEditData(row);
    }catch(error){
      status($("installationServicesEditStatus"),error.message,'error');
      $("installationServicesEditBody").innerHTML='<tr><td colspan="5" class="empty-cell">تعذر تحميل بيانات الطلب.</td></tr>';
    }finally{save.disabled=false}
  }
  function currentRow(id){return rows.find(row=>row.id===id)}

  function restoreEditForm() {
    const row = rows.find(item => item.id === editingRequestId);
    if (row) return openEdit(row);
  }

  function resetNewForm(options = {}) {
    const form = $("newInstallationRequestForm");
    if (!form) return;
    if (editingRequestId && !options.exitEdit) return restoreEditForm();
    editingRequestId = null;
    editingScheduleSnapshot = null;
    form.reset();
    quotationOptions("", "newInstallationQuotationId");
    neighborhoodOptions();
    setInstallationGeoFromNeighborhood('new','');
    $("newInstallationServicesBody").innerHTML = "";
    addServiceRow();
    $("newInstallationAnimalsBody").innerHTML = "";
    addAnimalRow();
    if($("newInstallationDiscountType")) $("newInstallationDiscountType").value = "amount";
    if($("newInstallationDiscount")) $("newInstallationDiscount").value = "0";
    if($("newInstallationAmountCollected")) $("newInstallationAmountCollected").value = "0";
    if($("newInstallationCollectionStatus")) $("newInstallationCollectionStatus").value = "غير محصل";
    if($("newInstallationPaymentMethod")) $("newInstallationPaymentMethod").value = "";
    if($("newInstallationAppointmentStatus")) $("newInstallationAppointmentStatus").value = "بانتظار المراجعة";
    if($("newInstallationScheduleDate")) $("newInstallationScheduleDate").value="";
    if($("newInstallationScheduleTime")) $("newInstallationScheduleTime").value="";
    if($("newInstallationScheduleTeam")) $("newInstallationScheduleTeam").value="";
    if($("newInstallationScheduleTechnician")) $("newInstallationScheduleTechnician").value="";
    recalculateServices();
    $("newInstallationRequestHeading").textContent = "إضافة موعد جديد";
    $("newInstallationRequestNote").textContent = "سجّل بيانات العميل والخدمات والحيوان والتحصيل. ينتقل الموعد بعد الحفظ إلى المواعيد بحالة بانتظار المراجعة.";
    $("saveNewInstallationRequest").textContent = "حفظ الموعد";
    $("resetNewInstallationRequest").textContent = "إعادة تعيين";
    clearStatus($("newInstallationRequestFormStatus"));
  }

  function syncNewRequestPermissionState() {
    const button = $("saveNewInstallationRequest");
    if (!button) return false;
    const isEditing = Boolean(editingRequestId);
    const screenKey = isEditing ? "installationRequests" : "installationRequestNew";
    const action = isEditing ? "edit" : "add";
    const engine = window.PermissionEngine;
    const loaded = engine?.isLoaded?.() === true || window.CustomerPermissions?.permissionsLoaded === true || window.CustomerPermissions?.currentRole?.() === "super_admin";
    const allowed = loaded && (engine?.can?.(screenKey, action) === true || window.CustomerPermissions?.canScreen?.(screenKey, action) === true);

    button.hidden = false;
    button.classList.remove("hidden");
    button.setAttribute("aria-hidden", "false");
    button.disabled = !allowed;
    button.setAttribute("aria-disabled", String(!allowed));
    button.title = allowed ? "" : (loaded ? "لا توجد صلاحية حفظ الموعد." : "جارٍ تحميل الصلاحيات...");

    if (loaded && !allowed) {
      status($("newInstallationRequestFormStatus"), isEditing
        ? "لا توجد صلاحية تعديل المواعيد."
        : "لا توجد صلاحية إضافة موعد. راجع صلاحيات شاشة إضافة موعد جديد.", "warning");
    }
    return allowed;
  }

  async function initializeNewView(options = {}) {
    try {
      const prefillIntent = readQuotationPrefillIntent();
      const preservePrefill = Boolean(options.preservePrefill || prefillIntent?.quotationId);
      if (!editingRequestId && !preservePrefill) resetNewForm({ exitEdit: true });
      if (!editingRequestId && preservePrefill) applyInstantQuotationPrefill(prefillIntent);

      await ensureOptions();
      try{
        [scheduleTeams,scheduleTechnicians]=await Promise.all([window.InstallationsServiceSafe.scheduleTeams(),window.InstallationsServiceSafe.technicianNameSuggestions()]);
        const team=$("newInstallationScheduleTeam");if(team){const current=team.value;team.innerHTML='<option value="">تحدد لاحقًا</option>'+scheduleTeams.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}${x.carName?` — ${esc(x.carName)}`:''}</option>`).join('');team.value=current;}
        const dl=$("newInstallationScheduleTechnicianOptions");if(dl)dl.innerHTML=scheduleTechnicians.map(x=>`<option value="${esc(x)}"></option>`).join('');
      }catch(error){console.warn('[Appointments] Optional schedule options unavailable:',error.message)}
      if (!editingRequestId) {
        if (!preservePrefill) resetNewForm({ exitEdit: true });
        else {
          quotationOptions($("newInstallationCustomerId")?.value || prefillIntent?.customerId || "", "newInstallationQuotationId", prefillIntent?.quotationId || "");
          neighborhoodOptions();
          hydrateServiceRows();
        }
      } else {
        quotationOptions($("newInstallationCustomerId")?.value || "", "newInstallationQuotationId");
        neighborhoodOptions();
        hydrateServiceRows();
      }
      if (!opts.serviceTypes.length) status($("newInstallationRequestFormStatus"), "لا توجد خدمات نشطة في البيانات المرجعية. أضف أنواع الخدمات أولًا قبل إنشاء الطلب.", "warning");
      syncNewRequestPermissionState();
    } catch (error) {
      status($("newInstallationRequestFormStatus"), error.message, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.addEventListener("kyum-installation-create-from-quotation", async event => {
      const detail = event.detail || {};
      editingRequestId = null;
      editingScheduleSnapshot = null;
      saveQuotationPrefillIntent(detail);
      applyInstantQuotationPrefill(detail);
      await initializeNewView({ preservePrefill: true });
      try { await applyQuotationPrefill(detail); } catch (error) { status($("newInstallationRequestFormStatus"), error.message, "error"); }
    });

    window.addEventListener("kyum-installation-edit-request", async event => {
      const id = event.detail?.id;
      if (!id) return;
      if (!rows.length) await load();
      const row = rows.find(item => item.id === id);
      if (row) await openEdit(row);
    });

    window.addEventListener("kyum-permissions-refreshed", () => syncNewRequestPermissionState());
    window.addEventListener("kyum-permission-engine-ready", () => syncNewRequestPermissionState());

    window.addEventListener("kyum-view-changed", event => {
      if (event.detail?.view === "installationRequests") load();
      if (event.detail?.view === "installationRequestNew") {
        const intent = readQuotationPrefillIntent();
        if (intent) applyInstantQuotationPrefill(intent);
        initializeNewView({ preservePrefill: Boolean(intent) }).then(() => applyQuotationPrefill(intent)).catch(error => status($("newInstallationRequestFormStatus"), error.message, "error"));
      }
    });

    $("newInstallationCustomerSearch")?.addEventListener("focus", event => renderCustomerResults(event.target.value));
    $("newInstallationCustomerSearch")?.addEventListener("input", event => {
      customerDefaultsSelectionToken++;
      $("newInstallationCustomerId").value = "";
      event.target.setCustomValidity("");
      renderCustomerResults(event.target.value);
      quotationOptions("", "newInstallationQuotationId");
      const digits=String(event.target.value||'').replace(/\D/g,'');
      if(digits.length>=9){
        const matches=opts.customers.filter(c=>String(c.phone||'').replace(/\D/g,'')===digits);
        if(matches.length===1){const customerId=matches[0].id;syncCustomerSearch(customerId);quotationOptions(customerId,'newInstallationQuotationId');closeCustomerResults();applyCustomerAppointmentDefaults(customerId).catch(error=>status($("newInstallationRequestFormStatus"),error.message,'error'));}
      }
    });
    $("newInstallationCustomerResults")?.addEventListener("click", async event => {
      const option = event.target.closest("[data-installation-customer-id]");
      if (!option) return;
      const customerId=option.dataset.installationCustomerId;
      syncCustomerSearch(customerId);
      quotationOptions(customerId, "newInstallationQuotationId");
      closeCustomerResults();
      await applyCustomerAppointmentDefaults(customerId);
    });
    $("newInstallationNeighborhoodSearch")?.addEventListener("focus",event=>renderNewNeighborhoodResults(event.target.value));
    $("newInstallationNeighborhoodSearch")?.addEventListener("input",event=>{
      $("newInstallationNeighborhoodId").value="";
      event.target.setCustomValidity("");
      renderNewNeighborhoodResults(event.target.value);
    });
    $("newInstallationNeighborhoodResults")?.addEventListener("click",event=>{
      const option=event.target.closest("[data-installation-neighborhood-id]");
      if(!option)return;
      setNewNeighborhood(option.dataset.installationNeighborhoodId);
    });

    document.addEventListener("click", event => {
      if (!event.target.closest(".installation-customer-combobox")) closeCustomerResults();
      if (!event.target.closest(".installation-neighborhood-combobox")) closeNewNeighborhoodResults();
      if(!event.target.closest(".installation-service-searchbox")&&!event.target.closest(".installation-service-search-results"))closeAllServicePickers();
    });

    ["installationRequestSearch", "installationRequestRepresentativeFilter", "installationRequestStatusFilter", "installationRequestDateFrom", "installationRequestDateTo"].forEach(id => $(id)?.addEventListener("input", render));
    $("resetInstallationRequestFilters")?.addEventListener("click", () => {
      ["installationRequestSearch", "installationRequestRepresentativeFilter", "installationRequestStatusFilter", "installationRequestDateFrom", "installationRequestDateTo"].forEach(id => { if ($(id)) $(id).value = ""; });
      render();
    });

    $("addInstallationServiceRow")?.addEventListener("click", () => addServiceRow());
    $("newInstallationServicesBody")?.addEventListener("input", event => {
      if (event.target.matches(".installation-service-quantity")) normalizeLatinNumericInput(event.target, { integer: true });
      if (event.target.matches(".installation-service-price")) normalizeLatinNumericInput(event.target);
      const row=event.target.closest(".installation-service-entry");
      if(event.target.matches(".installation-service-search")&&row){
        const options=row.querySelector(".installation-service-search-options");
        if(options)options.innerHTML=serviceSearchResults(event.target.value,row.querySelector(".installation-service-type")?.value||"");
      }
      recalculateServices();
    });
    $("newInstallationServicesBody")?.addEventListener("click", event => {
      const serviceOption=event.target.closest("[data-service-id]");
      if(serviceOption){const row=serviceOption.closest(".installation-service-entry"),service=opts.serviceTypes.find(item=>String(item.id)===String(serviceOption.dataset.serviceId));setServiceSearchValue(row,serviceOption.dataset.serviceId);if(service)row.querySelector(".installation-service-price").value=Number(service.default_price||0).toFixed(2);closeServicePicker(row);recalculateServices();return;}
      const selectButton=event.target.closest(".installation-service-select");
      if(selectButton){const row=selectButton.closest(".installation-service-entry"),panel=row?.querySelector(".installation-service-search-results");if(panel&&!panel.classList.contains("hidden"))closeServicePicker(row);else openServicePicker(row);return;}
      const button = event.target.closest(".installation-service-remove");
      if (!button) return;
      const rows = $("newInstallationServicesBody").querySelectorAll(".installation-service-entry");
      if (rows.length === 1) return status($("newInstallationRequestFormStatus"), "يجب أن يحتوي الطلب على خدمة واحدة على الأقل.", "error");
      button.closest(".installation-service-entry").remove();
      recalculateServices();
    });
    window.addEventListener("resize",()=>closeAllServicePickers(),{passive:true});
    window.addEventListener("scroll",()=>closeAllServicePickers(),{passive:true});
    $("newInstallationDiscount")?.addEventListener("input", event => { normalizeLatinNumericInput(event.target); recalculateServices(); });
    $("newInstallationAmountCollected")?.addEventListener("input", event => normalizeLatinNumericInput(event.target));
    $("newInstallationDiscountType")?.addEventListener("change",recalculateServices);
    $("addInstallationAnimalRow")?.addEventListener("click",()=>addAnimalRow());
    $("newInstallationAnimalsBody")?.addEventListener("input",event=>{if(event.target.matches('.appointment-animal-quantity'))normalizeLatinNumericInput(event.target,{integer:true});});
    $("newInstallationAnimalsBody")?.addEventListener("change",event=>{if(event.target.matches('.appointment-animal-type'))syncBreedSelect(event.target.closest('.appointment-animal-entry'));});
    $("newInstallationAnimalsBody")?.addEventListener("click",event=>{
      const button=event.target.closest(".appointment-animal-remove");
      if(!button)return;
      const all=$("newInstallationAnimalsBody").querySelectorAll(".appointment-animal-entry");
      if(all.length===1){
        all[0].querySelectorAll("input").forEach(input=>{ if(input.classList.contains('appointment-animal-quantity')) input.value='1'; else input.value=''; });
        all[0].querySelectorAll("select").forEach(select=>select.value='');
        return;
      }
      button.closest(".appointment-animal-entry").remove();
    });


    $("resetNewInstallationRequest")?.addEventListener("click", resetNewForm);

    $("installationRequestsView")?.addEventListener("click", async event => {
      const viewButton = event.target.closest("[data-install-view]");
      const servicesButton = event.target.closest("[data-install-services-edit]");
      const deleteButton = event.target.closest("[data-install-delete]");
      if (viewButton) { try { renderRequestView(await window.InstallationsServiceSafe.requestEditDetail(viewButton.dataset.installView)); } catch(error) { status($("installationRequestsStatus"),error.message,"error"); } }
      if (servicesButton) openServicesEdit(servicesButton.dataset.installServicesEdit);
      if (deleteButton && confirm("هل تريد حذف الموعد؟")) {
        try {
          await window.InstallationsServiceSafe.remove(deleteButton.dataset.installDelete);
          await load();
        } catch (error) {
          status($("installationRequestsStatus"), error.message, "error");
        }
      }
    });

    $("closeInstallationRequestViewDialog")?.addEventListener("click",()=>$("installationRequestViewDialog").close());
    $("closeInstallationRequestViewFooter")?.addEventListener("click",()=>$("installationRequestViewDialog").close());
    document.addEventListener('click',event=>{if(!event.target.closest('.installation-geo-select'))closeAllInstallationGeo()});
    $("installationServicesEditDialog")?.addEventListener('close',()=>closeAllInstallationGeo());
    $("closeInstallationServicesEditDialog")?.addEventListener("click",()=>$("installationServicesEditDialog").close());
    $("cancelInstallationServicesEdit")?.addEventListener("click",()=>$("installationServicesEditDialog").close());
    $("addInstallationInlineService")?.addEventListener("click",()=>addInlineServiceRow());
    $("installationServicesEditBody")?.addEventListener("input",event=>{if(event.target.matches('.inline-service-quantity'))normalizeLatinNumericInput(event.target,{integer:true});if(event.target.matches('.inline-service-price'))normalizeLatinNumericInput(event.target);const row=event.target.closest('.installation-inline-service-row');if(event.target.matches('.inline-service-type')){const service=opts.serviceTypes.find(item=>item.id===event.target.value);if(service&&row)row.querySelector('.inline-service-price').value=Number(service.default_price||0).toFixed(2)}recalculateInlineServices()});
    $("installationServicesEditBody")?.addEventListener("click",event=>{const btn=event.target.closest('.inline-service-remove');if(!btn)return;const all=$("installationServicesEditBody").querySelectorAll('.installation-inline-service-row');if(all.length===1)return status($("installationServicesEditStatus"),'يجب أن يحتوي الطلب على خدمة واحدة على الأقل.','error');btn.closest('tr').remove();recalculateInlineServices()});
    $("installationServicesEditMapUrl")?.addEventListener("input",syncInlineMapLink);
    $("installationServicesEditForm")?.addEventListener("submit",async event=>{event.preventDefault();const services=collectInlineServices();if(!services.length||services.some(x=>!x.serviceTypeId||!Number.isInteger(x.quantity)||x.quantity<1||!Number.isFinite(x.unitPrice)||x.unitPrice<0))return status($("installationServicesEditStatus"),'راجع الخدمة والعدد والسعر في جميع البنود.','error');const geoValidation=installationGeoController('edit').validate({requireRegion:true,requireCity:true,requireDistrict:true});if(!geoValidation.valid){installationGeoController('edit').elements(geoValidation.field)?.search?.focus();return status($("installationServicesEditStatus"),geoValidation.message,'error')}const neighborhoodId=geoValidation.value.districtId;const btn=$("saveInstallationServicesEdit");setSaveState(btn,'saving','حفظ التعديلات');try{const requestId=$("installationServicesEditRequestId").value;await window.InstallationsServiceSafe.updateRequestContextServices(requestId,{neighborhoodId,customerMapUrl:$("installationServicesEditMapUrl").value,customerOrderNumber:$("installationServicesEditCustomerOrder").value,quotationId:$("installationServicesEditQuotation").value,services});const fresh=await window.InstallationsServiceSafe.requestEditDetail(requestId);const index=rows.findIndex(item=>item.id===requestId);if(index>=0)rows[index]=fresh;setSaveState(btn,'saved');window.dispatchEvent(new CustomEvent('kyum-installation-services-updated',{detail:{id:requestId,row:fresh}}));await new Promise(r=>setTimeout(r,350));$("installationServicesEditDialog").close();render();load().catch(()=>{})}catch(error){setSaveState(btn,'error');status($("installationServicesEditStatus"),error.message,'error');await new Promise(r=>setTimeout(r,900))}finally{setSaveState(btn,'idle','حفظ التعديلات')}});
    window.addEventListener('kyum-installation-request-view',async event=>{const id=event.detail?.id||event.detail?.row?.id;if(!id)return;try{renderRequestView(await window.InstallationsServiceSafe.requestEditDetail(id))}catch(error){status($("installationRequestsStatus"),error.message,'error')}});
    window.addEventListener('kyum-installation-services-edit',event=>{const id=event.detail?.id;if(id)openServicesEdit(id)});
    window.addEventListener('kyum-installation-services-updated',()=>load());

    $("newInstallationRequestForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      clearStatus($("newInstallationRequestFormStatus"));
      if (!syncNewRequestPermissionState()) return;
      const customer = opts.customers.find(item => item.id === $("newInstallationCustomerId").value);
      const neighborhood = opts.neighborhoods.find(item => item.id === $("newInstallationNeighborhoodId").value);
      const services = collectServices();
      const animals = collectAnimals();
      const financials = currentFinancials();
      const collection = collectCollection();
      const payload = {
        customerId: $("newInstallationCustomerId").value,
        quotationId: $("newInstallationQuotationId").value || null,
        representativeId: (opts.quotations.find(item => String(item.id) === String($("newInstallationQuotationId").value || ""))?.representative_id) || null,
        neighborhoodId: $("newInstallationNeighborhoodId").value,
        installationAddress: neighborhood?.name || "",
        customerMapUrl: $("newInstallationCustomerMapUrl").value.trim(),
        locationNotes: $("newInstallationCustomerLocationNotes")?.value.trim() || "",
        notes: $("newInstallationNotes").value.trim(),
        services,
        discountType: financials.discountType,
        discountValue: financials.discountValue,
        discountAmount: financials.discount,
        animals,
        collection
      };
      if (!payload.customerId) return status($("newInstallationRequestFormStatus"), "اختر العميل.", "error");
      if (!payload.neighborhoodId || !neighborhood) {
        $("newInstallationNeighborhoodSearch")?.focus();
        return status($("newInstallationRequestFormStatus"), "اختر الحي.", "error");
      }
      if (!services.length || services.some(service => !service.serviceTypeId || !Number.isInteger(service.quantity) || service.quantity < 1 || !Number.isFinite(service.unitPrice) || service.unitPrice < 0)) {
        return status($("newInstallationRequestFormStatus"), "راجع نوع الخدمة والعدد والسعر في جميع الخدمات.", "error");
      }
      if (collection.amountCollected > financials.final) {
        return status($("newInstallationRequestFormStatus"), "المبلغ المحصل لا يمكن أن يتجاوز قيمة الجلسة.", "error");
      }
      const optionalSchedule={scheduledDate:$("newInstallationScheduleDate")?.value||"",scheduledTime:$("newInstallationScheduleTime")?.value||"",teamId:$("newInstallationScheduleTeam")?.value||"",technicianName:String($("newInstallationScheduleTechnician")?.value||"").trim(),assignmentNotes:payload.notes||""};
      const scheduleValues=[optionalSchedule.scheduledDate,optionalSchedule.scheduledTime,optionalSchedule.teamId,optionalSchedule.technicianName];
      const wantsSchedule=scheduleValues.some(Boolean);
      if(wantsSchedule&&!scheduleValues.every(Boolean))return status($("newInstallationRequestFormStatus"),"لجدولة الموعد الآن أكمل التاريخ والوقت والفرقة والجرومر، أو اترك بيانات الجدولة كلها فارغة.","error");
      const button = $("saveNewInstallationRequest");
      setSaveState(button,"saving", editingRequestId ? "حفظ التعديلات" : "حفظ الموعد");
      try {
        if (editingRequestId) {
          const originalSchedule=editingScheduleSnapshot||{scheduledDate:"",scheduledTime:"",teamId:"",technicianName:""};
          const scheduleChanged=["scheduledDate","scheduledTime","teamId","technicianName"].some(key=>String(optionalSchedule[key]||"")!==String(originalSchedule[key]||""));
          const hadSchedule=[originalSchedule.scheduledDate,originalSchedule.scheduledTime,originalSchedule.teamId,originalSchedule.technicianName].some(Boolean);
          if(scheduleChanged&&!wantsSchedule&&hadSchedule)return status($("newInstallationRequestFormStatus"),"لإلغاء الجدولة استخدم زر إلغاء الجدولة من شاشة الجدولة. لا تترك بيانات الجدولة الحالية فارغة من شاشة تعديل الطلب.","error");
          await window.InstallationsServiceSafe.updateRequest({ ...payload, id: editingRequestId });
          if(scheduleChanged&&wantsSchedule)await window.InstallationsServiceSafe.assign({...optionalSchedule,id:editingRequestId});
          const requestNumber = rows.find(item => item.id === editingRequestId)?.requestNumber || "";
          status($("newInstallationRequestFormStatus"), scheduleChanged&&wantsSchedule?`تم حفظ تعديلات الموعد ${requestNumber} وتحديث جدولته.`:`تم حفظ تعديلات الموعد ${requestNumber} دون تغيير موضعه في الجدول.`, "success");
          editingRequestId = null;
          editingScheduleSnapshot = null;
          await load();
          setSaveState(button,"saved");
          await new Promise(r=>setTimeout(r,450));
          const returnView=editingReturnView||"installationRequests";editingReturnView="installationRequests";
          window.KYUMNavigation?.open?.(returnView,{trustedNavigation:true});
        } else {
          const created=await window.InstallationsServiceSafe.createRequest(payload);
          if(wantsSchedule)await window.InstallationsServiceSafe.assign({...optionalSchedule,id:created.id});
          status($("newInstallationRequestFormStatus"),wantsSchedule?`تم إنشاء الموعد ${created.request_number||""} وجدولته في الموعد المحدد.`:`تم إنشاء الموعد ${created.request_number||""} ونقله إلى انتظار الجدولة.`,"success");
          setSaveState(button,"saved");
          await new Promise(r=>setTimeout(r,450));
          resetNewForm({ exitEdit: true });
          window.KYUMNavigation?.open?.("installationSchedule", { trustedNavigation: true });
        }
      } catch (error) {
        setSaveState(button,"error");
        status($("newInstallationRequestFormStatus"), error.message, "error");
      } finally {
        syncNewRequestPermissionState();
      }
    });

    window.KYUMInstallationsModule = Object.freeze({
      openFromQuotation(detail = {}) {
        saveQuotationPrefillIntent(detail);
        applyInstantQuotationPrefill(detail);
        const opened = window.KYUMNavigation?.open?.("installationRequestNew", { trustedNavigation: true });
        if (opened !== false) {
          setTimeout(() => window.dispatchEvent(new CustomEvent("kyum-installation-create-from-quotation", { detail })), 0);
        }
        return opened;
      },
      applyQuotationPrefill,
      async openRequestView(id){
        const requestId=id?.id||id;
        if(!requestId)return false;
        const row=await window.InstallationsServiceSafe.requestEditDetail(requestId);
        renderRequestView(row);
        return true;
      },
      openServicesEdit(id){return openServicesEdit(id)},
      async openRequestEdit(id,{returnView="installationRequests"}={}){const row=await window.InstallationsServiceSafe.requestEditDetail(id);editingReturnView=returnView;await openEdit(row);return true}
    });

;
  });

  window.addEventListener('petatoe-language-changed',()=>{
    document.querySelectorAll('#newInstallationServicesBody .installation-service-entry').forEach(row=>{
      const selected=row.querySelector('.installation-service-type')?.value||'';
      const service=opts.serviceTypes.find(item=>String(item.id)===String(selected));
      const label=row.querySelector('.installation-service-select-label');
      if(label)label.textContent=service?appointmentEntity('service',service.id,service.name):appointmentT('appointmentNew.services.select','اختر نوع الخدمة');
      const search=row.querySelector('.installation-service-search');
      if(search){search.placeholder=appointmentT('appointmentNew.services.search','ابحث عن خدمة...');search.setAttribute('aria-label',appointmentT('appointmentNew.services.searchAria','البحث في الخدمات'))}
    });
    document.querySelectorAll('#newInstallationAnimalsBody .appointment-animal-entry').forEach(row=>{
      const type=row.querySelector('.appointment-animal-type'), size=row.querySelector('.appointment-animal-size');
      const typeValue=type?.value||'', sizeValue=size?.value||'';
      if(type)type.innerHTML=`<option value="">${esc(appointmentT('appointmentNew.animals.selectType','اختر النوع'))}</option><option value="كلب" ${typeValue==='كلب'?'selected':''}>${esc(appointmentT('appointmentNew.animals.dog','كلب'))}</option><option value="قط" ${typeValue==='قط'?'selected':''}>${esc(appointmentT('appointmentNew.animals.cat','قط'))}</option><option value="أخرى" ${typeValue==='أخرى'?'selected':''}>${esc(appointmentT('appointmentNew.animals.other','أخرى'))}</option>`;
      if(size)size.innerHTML=`<option value="">${esc(appointmentT('appointmentNew.animals.selectSize','اختر الحجم'))}</option><option value="صغير" ${sizeValue==='صغير'?'selected':''}>${esc(appointmentT('appointmentNew.animals.small','صغير'))}</option><option value="متوسط" ${sizeValue==='متوسط'?'selected':''}>${esc(appointmentT('appointmentNew.animals.medium','متوسط'))}</option><option value="كبير" ${sizeValue==='كبير'?'selected':''}>${esc(appointmentT('appointmentNew.animals.large','كبير'))}</option>`;
      syncBreedSelect(row);
    });
    const statusInput=$('newInstallationAppointmentStatus');
    if(statusInput)statusInput.value=appointmentT('appointmentNew.collection.pendingReview','بانتظار المراجعة');
    recalculateServices();
  });
})();
