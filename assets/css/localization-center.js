(function(){
  'use strict';
  const STORAGE_LANGUAGE='petatoe-execution-pilot-language-v1';
  const STORAGE_CACHE='petatoe-localization-cache-v1';
  const SCREEN_KEY='installationExecution';
  const desktopPilot=()=>window.matchMedia?.('(min-width:1024px) and (hover:hover) and (pointer:fine)')?.matches===true&&Number(window.screen?.width||0)>1024;
  const rows=[
    ['execution.page.title','title','تنفيذ المواعيد','Appointment Execution'],
    ['execution.page.subtitle','subtitle','تحديث حالات الزيارات الميدانية وتوثيق التنفيذ','Update field visit statuses and document execution'],
    ['execution.tab.today','tab','طلبات اليوم','Today\'s Appointments'],
    ['execution.tab.current','tab','الطلب الحالي','Current Appointment'],
    ['execution.filter.groomer','label','الجرومر','Groomer'],
    ['execution.filter.allGroomers','option','كل الجرومر','All groomers'],
    ['execution.filter.team','label','الفرقة','Team'],
    ['execution.filter.allTeams','option','كل الفرق المسموح بها','All permitted teams'],
    ['execution.filter.date','label','التاريخ','Date'],
    ['execution.action.refresh','button','تحديث','Refresh'],
    ['execution.today.title','title','طلبات اليوم','Today\'s Appointments'],
    ['execution.today.note','help','الطلبات المجدولة للفرق المسموح لك بعرضها.','Scheduled appointments for teams you are permitted to view.'],
    ['execution.common.undefined','status','غير محدد','Not specified'],
    ['execution.common.unregistered','status','غير مسجل','Not registered'],
    ['execution.common.noAddress','status','لا يوجد عنوان','No address'],
    ['execution.common.unnamedTeam','status','فرقة غير مسماة','Unnamed team'],
    ['execution.common.linkedTeam','status','الفرقة المرتبطة','Linked team'],
    ['execution.common.noTeam','status','بدون فرقة','No team'],
    ['execution.common.unknownCustomer','status','عميل غير محدد','Unknown customer'],
    ['execution.common.unknownGroomer','status','جرومر غير محدد','Unknown groomer'],
    ['execution.common.services','noun','خدمات','services'],
    ['execution.common.appointments','noun','مواعيد','appointments'],
    ['execution.common.from','noun','من','from'],
    ['execution.common.to','noun','إلى','to'],
    ['execution.filter.noGroomerRequests','empty','لا توجد طلبات للجرومر في التاريخ المحدد','No appointments for this groomer on the selected date'],
    ['execution.filter.groomerLocked','help','الجرومر مرتبط بالحساب ومثبت على نطاق فرقته','The groomer is linked to this account and locked to the team scope'],
    ['execution.filter.noAssignedGroomerRequests','empty','لا توجد طلبات مسندة للجرومر في التاريخ المحدد','No assigned appointments for the groomer on the selected date'],
    ['execution.filter.teamLocked','help','الفرقة مرتبطة بحساب الجرومر / السائق ومثبتة على نطاقه','The team is linked to the groomer/driver account and locked to its scope'],
    ['execution.services.title','title','تفاصيل الخدمات','Service Details'],
    ['execution.services.empty','empty','لا توجد خدمات مسجلة.','No services are registered.'],
    ['execution.customer.phone','label','رقم العميل:','Customer phone:'],
    ['execution.customer.groomer','label','الجرومر:','Groomer:'],
    ['execution.customer.driver','label','السائق:','Driver:'],
    ['execution.customer.team','label','الفرقة:','Team:'],
    ['execution.customer.notes','label','ملاحظات:','Notes:'],
    ['execution.metrics.serviceCount','label','عدد الخدمات:','Service count:'],
    ['execution.metrics.totalWithTax','label','الإجمالي شامل الضريبة:','Total incl. VAT:'],
    ['execution.action.start','button','بدء التنفيذ','Start execution'],
    ['execution.today.emptyTitle','empty','لا توجد طلبات لهذا اليوم','No appointments for this day'],
    ['execution.today.emptyBody','empty','لا توجد طلبات متاحة ضمن الفرق والصلاحيات الحالية.','No appointments are available within the current team and permission scope.'],
    ['execution.time.minute','noun','دقيقة','minute'],
    ['execution.time.minutes','noun','دقيقة','minutes'],
    ['execution.time.hour','noun','ساعة','hour'],
    ['execution.time.hours','noun','ساعة','hours'],
    ['execution.time.hourAndMinute','format','{hours} ساعة و{minutes} دقيقة','{hours} hr {minutes} min'],
    ['execution.time.appointmentRange','format','{count} مواعيد — من {from} إلى {to}','{count} appointments — from {from} to {to}'],
    ['execution.map.open','button','فتح موقع العميل','Open customer location'],
    ['execution.map.missing','empty','لا يوجد رابط موقع مسجل','No location link is registered'],
    ['execution.stage.route','stage','بدء التحرك','Start route'],
    ['execution.stage.map','stage','فتح موقع العميل','Open customer location'],
    ['execution.stage.arrived','stage','وصل الموقع','Arrived at location'],
    ['execution.stage.arrivedAction','stage','وصلت إلى الموقع','Arrived at location'],
    ['execution.stage.start','stage','بدء الموعد','Start appointment'],
    ['execution.stage.collection','stage','التحصيل','Collection'],
    ['execution.stage.completed','stage','تم الانتهاء','Completed'],
    ['execution.stage.completedAction','stage','تم الانتهاء من الموعد','Complete appointment'],
    ['execution.stage.notStarted','status','لم تبدأ','Not started'],
    ['execution.stage.pathTitle','title','مسار تنفيذ الطلب','Appointment Execution Path'],
    ['execution.stage.routeHint','help','اضغط لبدء التحرك وتسجيل الوقت الحالي.','Start the route and record the current time.'],
    ['execution.stage.mapHint','help','افتح موقع العميل في خرائط جوجل لتسجيل وقت فتح الموقع.','Open the customer location in Google Maps to record the map-open time.'],
    ['execution.stage.arrivedHint','help','سجّل الوصول عند الوصول الفعلي.','Record arrival when you actually reach the location.'],
    ['execution.stage.startHint','help','ابدأ الموعد بعد التأكد من جاهزية الموقع.','Start the appointment after confirming the location is ready.'],
    ['execution.stage.collectionHint','help','سجّل المبلغ المستلم وطريقة التحصيل. هذه المرحلة إلزامية قبل إنهاء الموعد.','Record the amount received and payment method. This stage is mandatory before completion.'],
    ['execution.stage.completeHint','help','أضف الصور والملاحظات ثم اعتمد الانتهاء.','Add photos and notes, then confirm completion.'],
    ['execution.collection.mandatoryStage','label','المرحلة الإلزامية','Mandatory stage'],
    ['execution.collection.title','title','مرحلة التحصيل','Collection Stage'],
    ['execution.collection.intro','help','سجّل التحصيل من العميل قبل الانتقال إلى انتهاء الموعد.','Record the customer collection before moving to appointment completion.'],
    ['execution.collection.requiredBadge','status','إلزامية','Required'],
    ['execution.collection.requiredAlert','help','لا يمكن إنهاء الموعد قبل تأكيد مرحلة التحصيل.','The appointment cannot be completed before confirming collection.'],
    ['execution.collection.finalTotal','label','الإجمالي النهائي','Final total'],
    ['execution.collection.collectedBefore','label','المحصل سابقًا','Previously collected'],
    ['execution.collection.remaining','label','المتبقي للتحصيل','Remaining to collect'],
    ['execution.collection.amount','label','المبلغ المستلم من العميل','Amount received from customer'],
    ['execution.collection.method','label','طريقة التحصيل','Payment method'],
    ['execution.collection.chooseMethod','option','اختر طريقة التحصيل','Choose payment method'],
    ['execution.collection.cash','option','نقدي','Cash'],
    ['execution.collection.card','option','بطاقة','Card / POS'],
    ['execution.collection.bankTransfer','option','تحويل بنكي','Bank transfer'],
    ['execution.collection.online','option','دفع إلكتروني','Online payment'],
    ['execution.collection.reference','label','رقم العملية / المرجع (اختياري)','Transaction / reference number (optional)'],
    ['execution.collection.referencePlaceholder','placeholder','أدخل رقم العملية أو المرجع','Enter transaction or reference number'],
    ['execution.collection.notes','label','ملاحظات التحصيل (اختياري)','Collection notes (optional)'],
    ['execution.collection.notesPlaceholder','placeholder','اكتب ملاحظة عند الحاجة','Add a note if needed'],
    ['execution.collection.confirm','label','تأكيد التحصيل','Confirm collection'],
    ['execution.collection.confirmDeclaration','help','أقر بأن بيانات التحصيل المسجلة صحيحة.','I confirm that the recorded collection details are correct.'],
    ['execution.collection.submit','button','تأكيد التحصيل والانتقال للمرحلة التالية','Confirm collection and continue'],
    ['execution.observer.only','help','عرض ومتابعة فقط — لا توجد صلاحية لتغيير مراحل التنفيذ.','View-only mode — you do not have permission to change execution stages.'],
    ['execution.docs.title','title','التوثيق (اختياري)','Documentation (optional)'],
    ['execution.docs.upload','label','رفع صور التنفيذ','Upload execution photos'],
    ['execution.docs.uploadHint','help','اسحب الصور هنا أو اضغط للاختيار','Drag photos here or click to choose'],
    ['execution.docs.notes','label','ملاحظات التنفيذ','Execution notes'],
    ['execution.docs.notesPlaceholder','placeholder','اكتب ملاحظاتك هنا (اختياري)','Enter execution notes (optional)'],
    ['execution.docs.completionNote','help','بعد إنهاء الخطوات والتوثيق ينتقل الطلب تلقائيًا إلى شاشة تأكيد انتهاء المواعيد.','After completing the steps and documentation, the appointment moves automatically to completion confirmation.'],
    ['execution.summary.customer','label','العميل','Customer'],
    ['execution.summary.phone','label','الهاتف','Phone'],
    ['execution.summary.time','label','الوقت المحدد','Scheduled time'],
    ['execution.summary.services','label','عدد الخدمات','Service count'],
    ['execution.summary.address','label','العنوان','Address'],
    ['execution.action.returnSchedule','button','إلغاء وإعادة إلى شاشة الجدولة','Cancel and return to scheduling'],
    ['execution.stage.current','label','المرحلة الحالية','Current stage'],
    ['execution.current.selectorTitle','title','الطلبات قيد التنفيذ','Appointments in progress'],
    ['execution.current.selectorNote','help','اختر طلبًا لمتابعة موقف التنفيذ.','Choose an appointment to follow its execution status.'],
    ['execution.current.emptyTitle','empty','لا توجد طلبات قيد التنفيذ ضمن نطاقك','No appointments in progress within your scope'],
    ['execution.current.emptyBody','empty','تظهر هنا الطلبات الجارية التي تسمح بها صلاحياتك ونطاق بياناتك.','Active appointments allowed by your permissions and data scope appear here.'],
    ['execution.validation.invalidAmount','error','أدخل مبلغًا صحيحًا.','Enter a valid amount.'],
    ['execution.validation.amountExceedsRemaining','error','المبلغ المستلم لا يمكن أن يتجاوز المتبقي للتحصيل.','The received amount cannot exceed the remaining balance.'],
    ['execution.validation.collectionRequired','error','يجب تسجيل مبلغ التحصيل قبل إنهاء الموعد.','A collected amount must be recorded before completing the appointment.'],
    ['execution.validation.methodRequired','error','اختر طريقة التحصيل.','Choose a payment method.'],
    ['execution.photo.remove','button','حذف الصورة','Remove photo'],
    ['execution.photo.none','empty','لم يتم اختيار صور.','No photos selected.'],
    ['execution.loading','status','جاري تحميل طلبات التنفيذ...','Loading execution appointments...'],
    ['execution.return.prompt','dialog','اكتب سبب إلغاء الجدولة وإعادة الموعد إلى شاشة الجدولة:','Enter the reason for cancelling the schedule and returning the appointment to scheduling:'],
    ['execution.return.confirm','dialog','سيتم حفظ سبب إعادة الجدولة ومرحلة التنفيذ الحالية في تقارير المواعيد، ثم إعادة الطلب إلى شاشة الجدولة. هل تريد المتابعة؟','The rescheduling reason and current execution stage will be saved in appointment reports, then the appointment will return to scheduling. Continue?'],
    ['execution.status.assigned','status','مسند','Assigned'],
    ['execution.status.onRoute','status','في الطريق','On route'],
    ['execution.status.arrived','status','وصل إلى العميل','Arrived at customer'],
    ['execution.status.inProgress','status','قيد التنفيذ','In progress'],
    ['execution.status.completed','status','مكتمل','Completed'],
    ['execution.status.cancelled','status','ملغي','Cancelled'],
    ['execution.status.awaitingConfirmation','status','بانتظار التأكيد','Awaiting confirmation'],
    ['execution.error.noPermission','error','ليس لديك صلاحية لتنفيذ هذا الإجراء.','You do not have permission to perform this action.'],
    ['execution.error.loadTasks','error','تعذر تحميل مهام التنفيذ:','Unable to load execution tasks:'],
    ['execution.error.loadVisits','error','تعذر تحميل زيارات التنفيذ:','Unable to load execution visits:'],
    ['execution.error.loadVisitServices','error','تعذر تحميل خدمات زيارات التنفيذ:','Unable to load execution visit services:'],
    ['execution.error.loadIdentity','error','تعذر تحميل هوية الجرومر / السائق:','Unable to load groomer / driver identity:'],
    ['execution.error.loadScope','error','تعذر تحميل نطاق تنفيذ المواعيد:','Unable to load appointment execution scope:'],
    ['execution.error.selectVisit','error','تعذر اختيار زيارة التنفيذ الحالية:','Unable to select the current execution visit:'],
    ['execution.error.recordMap','error','تعذر تسجيل فتح موقع العميل:','Unable to record customer location opening:'],
    ['execution.error.updateStage','error','تعذر تحديث مرحلة التنفيذ:','Unable to update execution stage:'],
    ['execution.error.uploadPhoto','error','تعذر رفع صورة التنفيذ:','Unable to upload execution photo:'],
    ['execution.error.registerPhoto','error','تعذر تسجيل صورة التنفيذ:','Unable to register execution photo:'],
    ['execution.error.collection','error','تعذر تأكيد مرحلة التحصيل:','Unable to confirm the collection stage:'],
    ['execution.error.invalidStage','error','مرحلة التنفيذ غير مسموحة.','This execution stage is not allowed.'],
    ['execution.error.imageFormat','error','صيغة الصورة غير مدعومة.','Unsupported image format.'],
    ['execution.error.imageSize','error','حجم الصورة يجب أن يكون بين 1 بايت و10 ميجابايت.','Image size must be between 1 byte and 10 MB.'],
    ['execution.error.returnRestricted','error','إلغاء الطلب وإعادته للجدولة متاح للسوبر أدمن ومدير المبيعات فقط.','Cancelling and returning an appointment to scheduling is available only to the Super Admin and Sales Manager.'],
    ['execution.error.requestRequired','error','معرّف الموعد مطلوب.','Appointment ID is required.'],
    ['execution.error.returnReasonRequired','error','سبب إعادة الجدولة مطلوب.','A rescheduling reason is required.'],
    ['execution.error.returnFailed','error','تعذر إلغاء الطلب وإعادته إلى الجدولة:','Unable to cancel and return the appointment to scheduling:'],
    ['execution.translation.pending','status','الترجمة قيد المراجعة','Translation pending'],
    ['sidebar.group.main','navigation','الرئيسية','Home'],
    ['sidebar.dashboard','navigation','لوحة التحكم','Dashboard'],
    ['sidebar.dailyOperations','navigation','إدارة المهام اليومية','Daily Operations'],
    ['sidebar.group.customers','navigation','إدارة العملاء','Customer Management'],
    ['sidebar.customers','navigation','العملاء','Customers'],
    ['sidebar.followups','navigation','المتابعات','Follow-ups'],
    ['sidebar.quotations','navigation','عقود العملاء','Customer Contracts'],
    ['sidebar.salesInvoices','navigation','فواتير المبيعات','Sales Invoices'],
    ['sidebar.representatives','navigation','مندوبو المبيعات','Sales Representatives'],
    ['sidebar.referenceData','navigation','البيانات المرجعية','Reference Data'],
    ['sidebar.group.appointments','navigation','إدارة المواعيد','Appointment Management'],
    ['sidebar.appointmentsOverview','navigation','لوحة المواعيد','Appointments Dashboard'],
    ['sidebar.appointmentNew','navigation','إضافة موعد جديد','Add New Appointment'],
    ['sidebar.appointments','navigation','المواعيد','Appointments'],
    ['sidebar.appointmentSchedule','navigation','جدولة وتوزيع المواعيد','Appointment Scheduling & Dispatch'],
    ['sidebar.appointmentExecution','navigation','تنفيذ المواعيد','Appointment Execution'],
    ['sidebar.appointmentCompletion','navigation','تأكيد انتهاء المواعيد','Appointment Completion Confirmation'],
    ['sidebar.appointmentExceptions','navigation','الاستثناءات وإعادة الزيارة','Exceptions & Revisit'],
    ['sidebar.appointmentReports','navigation','تقارير المواعيد','Appointment Reports'],
    ['sidebar.appointmentSettings','navigation','إعدادات المواعيد','Appointment Settings'],
    ['sidebar.group.reports','navigation','التقارير والتحليلات','Reports & Analytics'],
    ['sidebar.reportsOverview','navigation','مركز التقارير','Reports Center'],
    ['sidebar.dailyPerformance','navigation','تقرير الأداء اليومي','Daily Performance Report'],
    ['sidebar.group.settings','navigation','الإعدادات والخصوصية','Settings & Privacy'],
    ['sidebar.users','navigation','المستخدمون','Users'],
    ['sidebar.permissions','navigation','الصلاحيات','Permissions'],
    ['sidebar.activityLog','navigation','سجل النشاط','Activity Log'],
    ['sidebar.backups','navigation','النسخ الاحتياطي','Backups'],
    ['sidebar.systemHealth','navigation','مراقبة النظام','System Health'],
    ['sidebar.notifications','navigation','مركز الإشعارات','Notification Center'],
    ['sidebar.translationCenter','navigation','مركز الترجمه','Translation Center'],
    ['sidebar.systemSettings','navigation','إعدادات النظام','System Settings'],
    ['sidebar.about','navigation','حول التطبيق','About App'],
    ['sidebar.account','navigation','حساب المستخدم','User Account'],
    ['sidebar.userFallback','navigation','مستخدم','User'],
    ['sidebar.logout','navigation','تسجيل الخروج','Log out'],
    ['sidebar.close','navigation','إغلاق القائمة','Close menu']
  ];
  const defaults=new Map(rows.map(([key,type,ar,en])=>[key,Object.freeze({key,type,screenKey:key.startsWith('sidebar.')?'sidebar':SCREEN_KEY,ar,en})]));
  const state={language:(localStorage.getItem(STORAGE_LANGUAGE)==='en'?'en':'ar'),remote:new Map(),loaded:false,loading:null};
  const ARABIC_RE=/[\u0600-\u06FF]/;
  function interpolate(value,vars){return String(value??'').replace(/\{(\w+)\}/g,(_,k)=>vars&&Object.prototype.hasOwnProperty.call(vars,k)?String(vars[k]):`{${k}}`)}
  function effectiveLanguage(){return desktopPilot()?state.language:'ar'}
  function entry(key){return state.remote.get(key)||defaults.get(key)||null}
  function t(key,vars={}){const item=entry(key);if(!item)return`[${key}]`;const lang=effectiveLanguage();const base=defaults.get(key);const value=lang==='en'?(item.en||base?.en):(item.ar||base?.ar);return interpolate(value||`[${key}]`,vars)}
  function serviceDefaultEnglish(name){
    const source=String(name||'').trim();
    const exact=new Map([
      ['أكياس قمامة للحيوانات','Pet Waste Bags'],['اكياس قمامة للحيوانات','Pet Waste Bags'],['اكرامية','Tip'],['إكرامية','Tip'],
      ['تقليم الاظافر','Nail Trimming'],['تقليم الأظافر','Nail Trimming'],['تشذيب المخالب','Claw Trimming'],
      ['تنظيف الاذنين','Ear Cleaning'],['تنظيف الأذنين','Ear Cleaning'],['تنظيف الاذن','Ear Cleaning'],['تنظيف الأذن','Ear Cleaning'],
      ['حلاقة للاعضاء التناسلية','Sanitary Trim'],['حلاقة للأعضاء التناسلية','Sanitary Trim'],['حلاقة الأعضاء التناسلية','Sanitary Trim'],
      ['تنظيف عميق للفراء','Deep Coat Cleaning'],['تنظيف الاسنان','Teeth Cleaning'],['تنظيف الأسنان','Teeth Cleaning'],
      ['حمام','Bath'],['استحمام','Bath'],['قص الشعر','Haircut'],['قص الشعر وسط','Medium Haircut'],['قص الشعر متوسط','Medium Haircut'],
      ['قص الشعر قصير','Short Haircut'],['قص الشعر طويل','Long Haircut'],['قص شعر وسط','Medium Haircut'],['قص شعر متوسط','Medium Haircut'],
      ['قص شعر قصير','Short Haircut'],['قص شعر طويل','Long Haircut']
    ]);
    if(exact.has(source))return exact.get(source);
    const packageMatch=source.match(/^(.+?)\s*-\s*(.+)$/);
    if(packageMatch){
      const packageNames={'الاساسية':'Basic Package','الأساسية':'Basic Package','الشاملة':'Full Package','السعيدة':'Happy Package'};
      const animals={'قط كبير':'Large Cat','قط متوسط':'Medium Cat','قط صغير':'Small Cat','كلب كبير':'Large Dog','كلب متوسط':'Medium Dog','كلب صغير':'Small Dog'};
      const left=packageNames[packageMatch[1].trim()],right=animals[packageMatch[2].trim()];
      if(left&&right)return `${left} - ${right}`;
    }
    return '';
  }
  function entityKey(kind,id){return `entity.${kind}.${String(id||'').trim()}`}
  function registerEntity(kind,item){
    const id=String(item?.id||'').trim();if(!id)return null;
    const key=entityKey(kind,id),ar=String(item?.name||item?.ar||'').trim();
    let en=String(item?.en||'').trim();
    if(kind==='service'&&!en)en=serviceDefaultEnglish(ar);
    const type=kind==='service'?'service':'neighborhood',screenKey=kind==='service'?'installationExecutionServices':'installationExecutionNeighborhoods';
    if(!defaults.has(key))defaults.set(key,Object.freeze({key,type,screenKey,ar,en}));
    return key;
  }
  function registerEntityCatalog(catalog={}){(catalog.services||[]).forEach(x=>registerEntity('service',x));(catalog.neighborhoods||[]).forEach(x=>registerEntity('neighborhood',x));return getRows()}
  function entityText(kind,item){
    const key=registerEntity(kind,item);if(!key)return effectiveLanguage()==='en'?'Not specified':String(item?.name||'');
    const value=t(key);
    if(effectiveLanguage()==='en'){
      const translated=String(value||'').trim();
      if(!translated||translated===`[${key}]`||ARABIC_RE.test(translated)){
        if(kind==='service')return serviceDefaultEnglish(item?.name)||t('execution.translation.pending');
        return t('execution.translation.pending');
      }
    }
    return value;
  }
  function statusLabel(value){const map={'مسند':'execution.status.assigned','في الطريق':'execution.status.onRoute','وصل إلى العميل':'execution.status.arrived','قيد التنفيذ':'execution.status.inProgress','مكتمل':'execution.status.completed','ملغي':'execution.status.cancelled','بانتظار التأكيد':'execution.status.awaitingConfirmation'};return map[value]?t(map[value]):String(value||'')}
  function translateMessage(message){const text=String(message||'');if(effectiveLanguage()==='ar'||!text)return text;for(const base of defaults.values()){if(base.type!=='error')continue;if(text===base.ar)return t(base.key);if(base.ar.endsWith(':')&&text.startsWith(base.ar))return `${t(base.key)}${text.slice(base.ar.length)}`;}return text}
  function cacheRows(){try{localStorage.setItem(STORAGE_CACHE,JSON.stringify([...state.remote.values()].map(x=>({translation_key:x.key,ar_text:x.ar,en_text:x.en,text_type:x.type,screen_key:x.screenKey||SCREEN_KEY}))))}catch(_){}}
  function loadCache(){try{const data=JSON.parse(localStorage.getItem(STORAGE_CACHE)||'[]');if(Array.isArray(data))data.forEach(row=>{const base=defaults.get(row.translation_key);state.remote.set(row.translation_key,{key:row.translation_key,ar:String(row.ar_text||base?.ar||''),en:String(row.en_text||base?.en||''),type:row.text_type||base?.type||'label',screenKey:row.screen_key||base?.screenKey||SCREEN_KEY})})}catch(_){}}
  async function loadRemote(force=false){if(state.loading&&!force)return state.loading;if(state.loaded&&!force)return getRows();state.loading=(async()=>{try{if(!window.LocalizationCenterService)return getRows();const data=await (window.LocalizationCenterService.listPilot?.()||window.LocalizationCenterService.listScreen(SCREEN_KEY));(data||[]).forEach(row=>{const base=defaults.get(row.translation_key);state.remote.set(row.translation_key,{key:row.translation_key,ar:String(row.ar_text||base?.ar||''),en:String(row.en_text||base?.en||''),type:row.text_type||base?.type||'label',screenKey:row.screen_key||base?.screenKey||SCREEN_KEY})});state.loaded=true;cacheRows();window.dispatchEvent(new CustomEvent('petatoe-localization-updated',{detail:{screenKey:SCREEN_KEY}}));return getRows()}catch(error){console.warn('[Localization] remote load deferred',error?.message||error);return getRows()}finally{state.loading=null}})();return state.loading}
  function getRows(){const keys=new Set([...defaults.keys(),...state.remote.keys()]);return [...keys].map(key=>{const base=defaults.get(key),remote=state.remote.get(key);const ar=String(remote?.ar||base?.ar||''),en=String(remote?.en||base?.en||'');return{key,type:remote?.type||base?.type||'label',screenKey:remote?.screenKey||base?.screenKey||SCREEN_KEY,ar,en,defaultAr:base?.ar||ar,defaultEn:base?.en||en,complete:Boolean(ar.trim()&&en.trim()&&!ARABIC_RE.test(en)),customized:Boolean(remote&&base&&(remote.ar!==base.ar||remote.en!==base.en))}}).sort((a,b)=>a.screenKey.localeCompare(b.screenKey)||a.key.localeCompare(b.key))}
  async function saveRows(entries){if(!window.LocalizationCenterService)throw new Error('خدمة مركز الترجمه غير جاهزة.');const normalized=(entries||[]).map(x=>{const base=defaults.get(x.key),remote=state.remote.get(x.key);return{translation_key:x.key,screen_key:x.screenKey||base?.screenKey||SCREEN_KEY,module_name:x.key.startsWith('sidebar.')?'navigation':'appointments',text_type:x.type||base?.type||'label',ar_text:String(x.ar||'').trim(),en_text:String(x.en||'').trim(),default_ar:base?.ar||String(x.ar||'').trim(),default_en:base?.en||String(x.en||'').trim(),_hadEnglish:Boolean(String(remote?.en||base?.en||'').trim())}});if(normalized.some(x=>x.en_text&&ARABIC_RE.test(x.en_text)))throw new Error('لا يمكن الحفظ مع نص عربي داخل العمود الإنجليزي.');if(normalized.some(x=>!x.ar_text||(x._hadEnglish&&!x.en_text)))throw new Error('لا يمكن حذف ترجمة مكتملة أو حفظ نص عربي فارغ.');const payload=normalized.filter(x=>x.ar_text&&x.en_text).map(({_hadEnglish,...x})=>x);if(payload.length)await (window.LocalizationCenterService.saveEntries?.(payload)||window.LocalizationCenterService.saveScreen(SCREEN_KEY,payload));payload.forEach(x=>state.remote.set(x.translation_key,{key:x.translation_key,ar:x.ar_text,en:x.en_text,type:x.text_type,screenKey:x.screen_key}));cacheRows();window.dispatchEvent(new CustomEvent('petatoe-localization-updated',{detail:{screenKey:SCREEN_KEY}}));return getRows()}
  function setLanguage(language){state.language=language==='en'?'en':'ar';localStorage.setItem(STORAGE_LANGUAGE,state.language);applyStatic(document);window.dispatchEvent(new CustomEvent('petatoe-language-changed',{detail:{screenKey:SCREEN_KEY,language:state.language}}));return state.language}
  function getLanguage(){return state.language}
  function applyStatic(root=document){const lang=effectiveLanguage();const scope=root?.querySelectorAll?root:document;scope.querySelectorAll?.('[data-execution-i18n]').forEach(el=>{el.textContent=t(el.dataset.executionI18n)});scope.querySelectorAll?.('[data-execution-i18n-placeholder]').forEach(el=>{el.setAttribute('placeholder',t(el.dataset.executionI18nPlaceholder))});scope.querySelectorAll?.('[data-petatoe-i18n]').forEach(el=>{el.textContent=t(el.dataset.petatoeI18n)});scope.querySelectorAll?.('[data-petatoe-i18n-aria]').forEach(el=>{const value=t(el.dataset.petatoeI18nAria);el.setAttribute('aria-label',value);el.setAttribute('title',value)});const view=document.getElementById('installationExecutionView');if(view){view.dir=lang==='en'?'ltr':'rtl';view.lang=lang==='en'?'en':'ar';view.dataset.executionLanguage=lang}const sidebar=document.getElementById('mainSidebar');if(sidebar&&desktopPilot()){sidebar.dir=lang==='en'?'ltr':'rtl';sidebar.lang=lang==='en'?'en':'ar';sidebar.dataset.petatoeLanguage=lang}}
  function pageMeta(){return[t('execution.page.title'),t('execution.page.subtitle')]}
  loadCache();
  window.PetatoeLocalization=Object.freeze({screenKey:SCREEN_KEY,t,statusLabel,translateMessage,getRows,loadRemote,saveRows,setLanguage,getLanguage,effectiveLanguage,applyStatic,pageMeta,desktopPilot,registerEntityCatalog,entityText,serviceDefaultEnglish});
  document.addEventListener('DOMContentLoaded',()=>{applyStatic(document);setTimeout(()=>loadRemote(false),0)});
})();
