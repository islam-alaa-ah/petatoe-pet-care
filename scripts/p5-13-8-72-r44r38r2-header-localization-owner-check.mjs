import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const ROOT=process.cwd();
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
let pass=0,fail=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} - ${name}`);ok?pass++:fail++;};
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const html=read('index.html');
const app=read('assets/js/app.js');
const loc=read('assets/js/localization-center.js');
const install=read('assets/js/installations-module.js');
const dashboard=read('assets/js/installation-dashboard-settings.js');
const ops=read('assets/js/installation-operations-reports.js');
const scheduling=read('assets/js/installation-scheduling.js');
const completion=read('assets/js/installation-completion.js');
const geography=read('assets/js/geographic-address.js');
const seaVibePayroll=read('assets/js/sea-vibe-payroll.js');
const c360=read('assets/js/customer360-export.js');
const AR=/[\u0600-\u06FF]/;

function localizationSandbox(cacheRows=[]){
  const cacheJson=JSON.stringify(cacheRows);
  const sandbox={
    console:{warn(){},log(){},error(){}},
    localStorage:{getItem(key){return key==='petatoe_localization_cache_v1'?cacheJson:null;},setItem(){},removeItem(){}},
    document:{addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},documentElement:{},body:{},title:''},
    CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
    setTimeout(){return 0;},clearTimeout(){},
    window:{screen:{width:0},matchMedia(){return{matches:false};},dispatchEvent(){},addEventListener(){}}
  };
  sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;
  vm.runInNewContext(loc,sandbox,{filename:'localization-center.js'});
  return sandbox.window.PetatoeLocalization;
}

const L=localizationSandbox();
const rows=L.getRows();
const keys=new Set(rows.map(x=>x.key));
check('R44R38R2 catalog has 5004 unique canonical defaults',rows.length===5004&&keys.size===5004);
check('Default Arabic/English catalog parity remains clean',rows.every(x=>String(x.ar||'').trim()&&String(x.en||'').trim()&&!AR.test(String(x.en||''))));
check('R44R38R2 dynamic filter/release keys resolve',[
  'shared.filter.allInterests','followups.dialog.noSaleReasonNone','contracts.dialog.rejectionReasonChoose',
  'pwa.update.release.r44r38r1.title','pwa.update.release.r44r38r1.note1','pwa.update.release.r44r38r1.note2','pwa.update.release.r44r38r1.note3',
  'pwa.update.release.r44r38r2.title','pwa.update.release.r44r38r2.note1','pwa.update.release.r44r38r2.note2','pwa.update.release.r44r38r2.note3'
].every(k=>keys.has(k)));

const badRemote=localizationSandbox([{translation_key:'shared.cache.lessMinute',ar_text:'يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ أقل من دقيقة.',en_text:'يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ أقل من دقيقة.',text_type:'status'}]);
badRemote.setLanguage('en');
check('English runtime rejects Arabic remote/cache override when a clean default exists',badRemote.t('shared.cache.lessMinute')==='Showing locally cached data — last synced less than a minute ago.');
check('Native date owner uses English Latin locale and covers dynamically inserted date inputs',loc.includes("el.lang=lang==='en'?'en-GB':'ar-SA'")&&loc.includes('function applyDateLocale(root=document)')&&loc.includes("new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node?.nodeType===1)applyDateLocale(node)})))"));

const refs=new Set();
for(const name of fs.readdirSync(path.join(ROOT,'assets/js')).filter(x=>x.endsWith('.js'))){
  const src=read(`assets/js/${name}`);
  for(const re of [/(?:\b(?:t|tr|l1T|customerT|appointmentT|geoT)\s*\(|PetatoeLocalization\?\.t\?\.\s*\()\s*["']([^"']+)["']/g]) for(const m of src.matchAll(re)) refs.add(m[1]);
}
for(const m of html.matchAll(/data-(?:petatoe|execution)-i18n(?:-(?:aria|title|placeholder|alt))?=["']([^"']+)["']/g))refs.add(m[1]);
check('All literal runtime/static localization references resolve after cleanup',[...refs].every(k=>keys.has(k)));

let staticDebt=0;
for(const line of html.split(/\r?\n/)){
  if(!AR.test(line)||/data-(?:petatoe|execution)-i18n/.test(line))continue;
  staticDebt += [...line.matchAll(/(?:placeholder|title|aria-label)=["']([^"']*[\u0600-\u06FF][^"']*)["']/g)].length;
  staticDebt += [...line.matchAll(/>([^<>]*[\u0600-\u06FF][^<>]*)</g)].length;
}
check('Static HTML uncovered Arabic candidates remain zero',staticDebt===0);

check('Dynamic representative/interest/reason placeholders use canonical localization labels',
  app.includes('function referencePlaceholderLabel(id)')&&
  app.includes('followupRepFilter: ["followups.filter.allReps", "كل المندوبين"]')&&
  app.includes('quotationRepFilter: ["contracts.filter.allReps", "كل المندوبين"]')&&
  app.includes('referencePlaceholderLabel(id)')&&
  app.includes('referencePlaceholderLabel("noSaleReason")')&&
  app.includes('refreshReferenceLocalizationLabels();')&&
  !app.includes('followupRepFilter: "كل المندوبين"')&&
  !app.includes('quotationRepFilter: "كل المندوبين"'));
check('Daily Operations and Daily Performance localize stored follow-up/contract enums only at display layer',
  app.includes('row.method ? followupMethodLabel(row.method)')&&
  app.includes('row.result ? followupResultLabel(row.result)')&&
  app.includes('row.status ? quotationStatusLabel(row.status)')&&
  app.includes('item.method ? followupMethodLabel(item.method)')&&
  app.includes('item.status ? quotationStatusLabel(item.status)'));
check('Filtered follow-up/contract generated reports localize enum columns',
  app.includes('value:r=>r.method ? followupMethodLabel(r.method)')&&
  app.includes('value:r=>r.result ? followupResultLabel(r.result)')&&
  app.includes('value:r=>r.status ? quotationStatusLabel(r.status)'));
check('Daily generated PDF owners are language-aware and no longer hard-code Arabic report headings',
  app.includes('dailyPerformancePdfEscape(l1T("dailyPerformance.export.pdfTitle"))')&&
  app.includes('dailyPerformancePdfEscape(l1T("dailyPerformance.export.pdfSubtitle"))')&&
  app.includes('new Intl.DateTimeFormat(l1Locale()')&&
  !app.includes('<h1 style="margin:0 0 6px;font-size:30px">تقرير الأداء اليومي</h1>')&&
  !app.includes('host.setAttribute("dir", "rtl")'));

check('Appointment entity display uses canonical object contract',install.includes('const item = id && typeof id === "object" ? id : { id, name: fallback };')&&install.includes('entityText?.(kind, item)'));
check('Appointment neighborhood display uses canonical geography owner on desktop/mobile/detail/selectors',
  install.includes('appointmentNeighborhoodLabel(row.neighborhoodId, row.installationAddress || row.district || "")')&&
  install.includes("appointmentNeighborhoodLabel(row.neighborhoodId,row.installationAddress||row.district||'')")&&
  install.includes('function newNeighborhoodLabel(item){return String(appointmentNeighborhoodLabel(')&&
  install.includes('${esc(newNeighborhoodLabel(item))}</option>'));
check('Canonical geography owner localizes region/city/district display labels without changing stored values',
  geography.includes('function localizedGeographyLabel(type = "district", id = "", fallbackName = "")')&&
  geography.includes('localizedGeographyLabel,')&&
  scheduling.includes("const neighborhoodLabel=(id,fallback='')=>window.KYUMGeography?.localizedDistrictLabel?.(id,fallback)||fallback")&&
  scheduling.includes("neighborhoodLabel(row.neighborhoodId,row.installationAddress||row.district||'')")&&
  scheduling.includes("neighborhoodLabel(r.neighborhoodId,r.neighborhoodName||r.installationAddress||'')")&&
  completion.includes('localizedGeographyLabel?.("district","",value)'));
check('Appointment service errors remain display-layer localized and fall back safely in English',
  /effectiveLanguage\?\.\(\)|effectiveLanguage/.test(install)&&/test\(translated\).*fallback \? fallback/.test(install)&&
  /lang\(\)==='en'.*test\(translated\).*fallback\?fallback/.test(scheduling)&&
  /lang\(\)==='en'.*test\(translated\).*fallback\?fallback/.test(ops)&&
  /lang\(\)==="en".*test\(translated\).*fallback\?fallback/.test(completion)&&
  /effectiveLanguage.*'en'.*test\(translated\).*fallback\?fallback/.test(dashboard));
check('Readonly appointment status is localized while stored collection status remains unchanged',
  install.includes('function setAppointmentStatusDisplay(value = "بانتظار المراجعة")')&&
  install.includes("appointmentStatus:'بانتظار المراجعة'")&&
  !install.includes("if(statusInput)statusInput.value='بانتظار المراجعة'"));
check('Appointment dashboard localizes dynamic status distribution/upcoming values',
  dashboard.includes('appointmentStatusLabel(k)')&&dashboard.includes('appointmentStatusLabel(r.status)')&&
  dashboard.includes("t('appointments.requests.loading'")&&dashboard.includes("t('appointments.schedule.noAppointments'")&&
  dashboard.includes("window.addEventListener('petatoe-language-changed'"));
check('Appointment reports localize reschedule/status/payment/geography generated output at display layer',
  ops.includes('const rescheduleStageLabel=')&&
  ops.includes('e.stage?rescheduleStageLabel(e.stage)')&&
  ops.includes('e.previousStatus?appointmentStatusLabel(e.previousStatus)')&&
  ops.includes('appointmentStatusLabel(r.status),r.requestedQuantity')&&
  ops.includes('esc(paymentLabel(x.name))')&&
  ops.includes("geographyLabel('region',o.regionId,o.regionName)")&&
  ops.includes("geographyLabel('city',o.cityId,o.cityName)")&&
  ops.includes("geographyLabel('district',o.neighborhoodId,o.neighborhoodName)")&&
  !ops.includes('<td>إجمالي ${esc(team?.name'));
check('SEA VIBE payroll reference payment method uses existing display label helper',
  seaVibePayroll.includes("<td>${esc(row.paymentMethod?paymentMethodLabel(row.paymentMethod):'—')}</td>")&&
  !seaVibePayroll.includes("<td>${esc(row.paymentMethod||'—')}</td>"));
check('Customer 360 Excel/print localizes follow-up and contract enum values',
  c360.includes('followupMethodLabel(item.method)')&&c360.includes('followupResultLabel(item.result)')&&c360.includes('quotationStatusLabel(item.status)'));

const expectedCache='petatoe-pwa-18-56-91-header-localization-owner-r44r38r2-p5-13-8-72';
const tokens=[...html.matchAll(/[?&]v=(18\.\d+\.\d+)/g)].map(m=>m[1]);
check('R44R38R2 version/build/package/PWA/cache aligned',version.version==='18.56.91'&&version.build===185691&&pkg.version==='18.56.91'&&read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.91";')&&read('service-worker.js').includes(expectedCache)&&version.cacheToken===expectedCache);
check('Migration manifest release metadata follows R44R38R2 without altering historical SQL inventory',manifest.release?.phase==='R44R38R2'&&manifest.release?.version==='18.56.91'&&manifest.release?.build===185691&&manifest.inventoryStats?.sqlFileCount===266);
check('All HTML local asset query tokens are 18.56.91',tokens.length===97&&tokens.every(v=>v==='18.56.91'));
check('R44R38R2 update metadata points to localized release notes',version.titleI18nKey==='pwa.update.release.r44r38r2.title'&&version.notesI18nKeys?.length===3&&version.notesI18nKeys.every(k=>keys.has(k)));

const protectedHashes={
'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
'assets/js/sync-retention.js':'4b98c05457eaa859cc70fc9779bb7f8c9490bdfc70976b233814d8a45452835b',
'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456',
'assets/js/permissions-service.js':'e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a',
'assets/js/installations-service.js':'8749ff95e4afda0f0bd9bfe038d0e68694219a2ad677f08d8a5585a871129153',
'assets/js/installation-execution.js':'fccf11de9e11108756de4669891348941a0aca8bab8c34fd5f4da547d5754fa7',
'assets/js/payroll-service.js':'9cec5332ba14066b54dce5b0647042cf3e668dd583b41e4e8ab0dde974bfc6e6',
'assets/js/sales-invoices-service.js':'f5199ee2071b7bf060842c24752d1de116e9dc88d8cba590022b001302f7629e',
'assets/js/vehicle-treasury-service.js':'9f00b2fe7527501a33d490e064a0f25b86d55298dc9cf0cba598927f07bc32e7',
'assets/js/sea-vibe-service.js':'072c48f7f5da3110e6c1e262ad4023e9d15901bbede66af3ca717615d1f184b1',
'assets/js/sea-vibe-payroll-service.js':'9d12f4df1a6f40e0c495ac760cef181ea1e5df904927c0f71963e2ea3864f574',
'assets/js/notification-center-service.js':'3e4e803faa96e540b1dbf6d48d5a913af5c6564d4bd401dbec4b8024cf25ee15',
'assets/js/whatsapp-template-service.js':'b3818328ffe6ed9aade0ff0abfe757eef2cfc9992778ac16019ef4b9d82f6292'};
check('Protected service/offline/sync/permission owners remain byte-identical to official baseline',Object.entries(protectedHashes).every(([f,h])=>sha(f)===h));
let cssHash=crypto.createHash('sha256');for(const name of fs.readdirSync(path.join(ROOT,'assets/css')).filter(x=>x.endsWith('.css')).sort()){cssHash.update(name);cssHash.update('\0');cssHash.update(fs.readFileSync(path.join(ROOT,'assets/css',name)));cssHash.update('\0');}
check('All CSS owners remain byte-identical — no layer over layer',cssHash.digest('hex')==='82ef9f4afd7060595e4912e0a17b17220928fd49bcbe4c476674f67a5599ce90');
check('R44 pruning remains byte-identical and disabled',sha('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql')==='60ac42da073c1693c31d13ce5b7dd5ae954ca7b0005261e6e36722ab22cd0af9'&&/execution_enabled\s*=\s*false/.test(read('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql')));

const physical=fs.readdirSync(path.join(ROOT,'supabase/migrations')).filter(x=>x.endsWith('.sql')).map(x=>`supabase/migrations/${x}`).sort();
const inventoried=new Set((manifest.historicalInventory||[]).map(x=>x.path));
const extras=physical.filter(x=>!inventoried.has(x));
const expectedExtras=[
  'supabase/migrations/PETATOE-Jeddah-Neighborhood-Translation-Backfill.sql',
  'supabase/migrations/PETATOE-Remaining-23-Neighborhoods-English-Backfill.sql',
  'supabase/migrations/R44R37R2R1-Recovery.sql'
].sort();
check('No SQL/migration drift was added by R44R38R2; the pre-existing 269-vs-266 HOLD is unchanged',physical.length===269&&manifest.inventoryStats?.sqlFileCount===266&&extras.length===3&&extras.every((x,i)=>x===expectedExtras[i]));


const viewsBlock=app.match(/const views = \{([\s\S]*?)\n\};/)?.[1]||'';
const viewKeys=[...viewsBlock.matchAll(/^\s*([A-Za-z0-9_]+):\s*document\.getElementById/gm)].map(m=>m[1]);
const headerMetaBlock=app.match(/const PAGE_META_I18N_KEYS = Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1]||'';
const headerMetaKeys=[...headerMetaBlock.matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map(m=>m[1]);
check('Canonical header metadata covers every registered view exactly once (52/52)',viewKeys.length===52&&headerMetaKeys.length===52&&viewKeys.every(k=>headerMetaKeys.includes(k))&&headerMetaKeys.every(k=>viewKeys.includes(k))&&new Set(headerMetaKeys).size===52);
check('Header title/subtitle are detached from static Dashboard localization ownership',/id="pageTitle"\s+data-petatoe-page-meta="title"/.test(html)&&/id="pageSubtitle"\s+data-petatoe-page-meta="subtitle"/.test(html)&&!/id="pageTitle"[^>]*data-petatoe-i18n=/.test(html)&&!/id="pageSubtitle"[^>]*data-petatoe-i18n=/.test(html));
check('Single canonical renderActivePageMeta owner writes header title/subtitle',(app.match(/function renderActivePageMeta\(/g)||[]).length===1&&app.includes('titleNode.textContent = meta?.[0] || "";')&&app.includes('subtitleNode.textContent = meta?.[1] || "";')&&!app.includes('const localizedPageMetaKeys ='));
const switchViewBlock=app.match(/function switchView\([\s\S]*?\n}\n\n\nwindow\.addEventListener\("petatoe-language-changed"/)?.[0]||'';
check('Navigation renders the active-view header through the canonical owner',switchViewBlock.includes('renderActivePageMeta(name);'));
const languageOwner=app.match(/window\.addEventListener\("petatoe-language-changed", \(\) => \{[\s\S]*?\n}\);/)?.[0]||'';
check('Language change restores active-view header after static localization',languageOwner.indexOf('applyStatic?.(document)')>=0&&languageOwner.indexOf('renderActivePageMeta();')>languageOwner.indexOf('applyStatic?.(document)'));
const updatedOwner=app.match(/window\.addEventListener\("petatoe-localization-updated", \(\) => \{[\s\S]*?\n}\);/)?.[0]||'';
check('Remote/custom localization update restores active-view header after static localization',updatedOwner.indexOf('applyStatic?.(document)')>=0&&updatedOwner.indexOf('renderActivePageMeta();')>updatedOwner.indexOf('applyStatic?.(document)'));
const headerLiteralKeys=[...headerMetaBlock.matchAll(/"([A-Za-z0-9_.-]+)"/g)].map(m=>m[1]);
const pageMetaSource=app.match(/const pageMeta = \{([\s\S]*?)\n\};/)?.[1]||'';
for(const ref of ['users','permissions','activityLog','backups','systemHealth','systemSettings']){const m=pageMetaSource.match(new RegExp(`^\\s*${ref}: \\["([^"]+)", "([^"]+)"\\]`,'m'));if(m)headerLiteralKeys.push(m[1],m[2]);}
check('Every header title/subtitle localization key has complete Arabic and English text',headerLiteralKeys.every(k=>{const row=rows.find(x=>x.key===k);return row&&String(row.ar||'').trim()&&String(row.en||'').trim()&&!AR.test(String(row.en||''));}));
check('SEA VIBE operational views use dedicated SEA VIBE metadata, never Dashboard metadata',['seaVibeTrips','seaVibeCustomers','seaVibeTripNew','seaVibeTripDetails','seaVibeExpenseNew','seaVibeGeneralExpenses','seaVibeAssets','seaVibeTreasury','seaVibeZawel','seaVibeFuel','seaVibeReference','seaVibeReports'].every(k=>new RegExp(`\\b${k}: \\["seaVibe\\.page\\.`).test(headerMetaBlock))&&!/seaVibe[A-Za-z]+:\s*\["dashboard\./.test(headerMetaBlock));
check('SEA VIBE payroll views use dedicated SEA VIBE payroll metadata',['seaVibePayrollManagement','seaVibeSalaryStatement','seaVibeCommissionManagement','seaVibeCommissionStatement','seaVibePayrollReference'].every(k=>new RegExp(`\\b${k}: \\["seaVibePayroll\\.page\\.`).test(headerMetaBlock)));
check('Problem-screen bilingual header names resolve correctly',L.setLanguage('ar')==='ar'&&L.t('contracts.page.title')==='عقود العملاء'&&L.t('seaVibe.page.trips.title')==='SEA VIBE — الرحلات'&&L.setLanguage('en')==='en'&&L.t('contracts.page.title')==='Customer Contracts'&&L.t('seaVibe.page.trips.title')==='SEA VIBE — Trips');
const headerWriters=fs.readdirSync(path.join(ROOT,'assets/js')).filter(x=>x.endsWith('.js')).filter(name=>/getElementById\(["']page(?:Title|Subtitle)["']\)/.test(read(`assets/js/${name}`)));
check('No secondary JS module owns pageTitle/pageSubtitle',headerWriters.length===1&&headerWriters[0]==='app.js');
check('SEA VIBE runtime modules are byte-identical; no module-specific hotfix layer was added',sha('assets/js/sea-vibe.js')==='462e7e323665b8be1298c23514428f9190d7e394a727ebb1a2821431e555d4a7'&&sha('assets/js/sea-vibe-payroll.js')==='1ba9ad9b56ef7c6e66bff675891b73a7b2de070e65f898705c4e40d81a50b67d');

console.log(`R44R38R2 L7 + header localization owner certification: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);
