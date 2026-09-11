import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const ROOT=process.cwd();
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
const aggregate=files=>{const h=crypto.createHash('sha256');for(const f of [...files].sort()){h.update(f);h.update('\0');h.update(fs.readFileSync(path.join(ROOT,f)));h.update('\0');}return h.digest('hex');};
let pass=0,fail=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} - ${name}`);ok?pass++:fail++;};
const AR=/[\u0600-\u06FF]/;

const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const html=read('index.html');
const loc=read('assets/js/localization-center.js');
const app=read('assets/js/app.js');
const contact=read('assets/js/appointment-contact-data.js');
const settings=read('assets/js/installation-settings-management.js');
const reports=read('assets/js/installation-operations-reports.js');
const scheduling=read('assets/js/installation-scheduling.js');
const completion=read('assets/js/installation-completion.js');
const installations=read('assets/js/installations-module.js');
const geography=read('assets/js/geographic-address.js');
const treasury=read('assets/js/vehicle-treasury.js');
const style=read('assets/css/style.css');

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
check('R44R38R3 catalog has 5020 unique canonical entries',rows.length===5020&&keys.size===5020);
check('Default Arabic/English catalog parity remains complete and English-clean',rows.every(x=>String(x.ar||'').trim()&&String(x.en||'').trim()&&!AR.test(String(x.en||''))));
check('R44R38R3 temporal/treasury/release localization keys resolve',[
  'shared.temporal.openPicker','shared.temporal.previous','shared.temporal.next','shared.temporal.today','shared.temporal.clear','shared.temporal.cancel','shared.temporal.datePlaceholder','shared.temporal.monthPlaceholder',
  'vehicleTreasury.reference.noInvoice','vehicleTreasury.reference.noRequest','vehicleTreasury.description.cashInvoice','vehicleTreasury.description.cashInvoiceOnly',
  'pwa.update.release.r44r38r3.title','pwa.update.release.r44r38r3.note1','pwa.update.release.r44r38r3.note2','pwa.update.release.r44r38r3.note3'
].every(k=>keys.has(k)));

const badRemote=localizationSandbox([{translation_key:'shared.cache.lessMinute',ar_text:'يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ أقل من دقيقة.',en_text:'يتم عرض بيانات محفوظة محليًا — آخر مزامنة منذ أقل من دقيقة.',text_type:'status'}]);
badRemote.setLanguage('en');
check('English runtime rejects stale Arabic remote/cache text when clean default exists',badRemote.t('shared.cache.lessMinute')==='Showing locally cached data — last synced less than a minute ago.');

const requiredServicePairs=new Map([
  ['الشاملة - كلب متوسط','Comprehensive Package - Medium Dog'],['الاساسية - كلب متوسط','Basic Package - Medium Dog'],['السعيدة - كلب كبير','Happy Package - Large Dog'],['الاساسية - كلب كبير','Basic Package - Large Dog'],['تقليم الاظافر','Nail Trimming'],['تنظيف الاذنين','Ear Cleaning'],['اكرامية','Tip'],['اعاده موعد مجاني بسبب شكوى العميل','Free Repeat Appointment Due to Customer Complaint'],['أكياس قمامة للحيوانات','Pet Waste Bags']
]);
L.setLanguage('en');
check('Canonical service display defaults cover the production service names observed in English screens',[...requiredServicePairs].every(([ar,en])=>L.serviceDefaultEnglish(ar)===en));

check('Canonical temporal owner replaces native date/month UI only in English and preserves ISO field values',
  loc.includes('function ownTemporalInput(input)')&&loc.includes('function restoreTemporalInput(input)')&&
  loc.includes("temporal.forEach(input=>lang==='en'?ownTemporalInput(input):restoreTemporalInput(input))")&&
  loc.includes("if(input.type!=='text')input.type='text'")&&loc.includes('input.type=kind')&&
  loc.includes("input.pattern=kind==='month'?'\\\\d{4}-\\\\d{2}':'\\\\d{4}-\\\\d{2}-\\\\d{2}'")&&
  loc.includes("function commitTemporalValue(value){const input=temporalState.target")&&
  loc.includes("input.value=String(value||'')"));
check('Canonical temporal picker is Gregorian and explicitly uses Latin digits in English mode',
  loc.includes("function temporalLocale(){return effectiveLanguage()==='en'?'en-US-u-ca-gregory-nu-latn':'ar-SA-u-ca-gregory-nu-latn'}")&&
  loc.includes("calendar:'gregory'")&&loc.includes("numberingSystem:'latn'"));
check('All dynamically inserted date/month fields are routed through the temporal owner',
  loc.includes("new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node?.nodeType===1)applyInputLocale(node)})))")&&
  loc.includes("input[type=\"date\"],input[type=\"month\"],input[data-petatoe-temporal-type]"));
check('No date/month consumer depends on valueAsDate/valueAsNumber native semantics',
  ![html,...fs.readdirSync(path.join(ROOT,'assets/js')).filter(x=>x.endsWith('.js')).map(x=>read(`assets/js/${x}`))].join('\n').match(/valueAsDate|valueAsNumber/));
check('Contact Data uses the canonical English picker on desktop/tablet/mobile and keeps native Arabic fallback',
  contact.includes("PetatoeLocalization?.effectiveLanguage?.()==='en'&&window.PetatoeLocalization?.openTemporalPicker?.(input)")&&
  !contact.includes('isMobileDatePickerSurface')&&contact.includes("typeof input.showPicker==='function'"));
check('Numeric inputs are forced to Latin rendering only in English and restored to Arabic locale in Arabic mode',
  loc.includes("const english=lang==='en';input.lang=english?'en-US':'ar-SA';input.dir=english?'ltr':'rtl';input.classList.toggle('petatoe-latin-number-input',english)"));

const temporalCss=style.match(/\/\* R44R38R3 — canonical app-owned Gregorian date\/month controls \*\/[\s\S]*?(?=@media \(min-width:1024px\))/)?.[0]||'';
check('Temporal UI is implemented in the canonical style owner without !important hotfixes',temporalCss.includes('.petatoe-temporal-dialog')&&temporalCss.includes('.petatoe-temporal-picker-button')&&!temporalCss.includes('!important'));
check('All other CSS owners remain byte-identical to R44R38R2',aggregate(fs.readdirSync(path.join(ROOT,'assets/css')).filter(x=>x.endsWith('.css')&&x!=='style.css').map(x=>`assets/css/${x}`))==='7724ff11769ad6e5f3ce5576e801ee2c4d18e1686096f29bfba260d88b597869');

check('Appointment Settings service table uses canonical service display text without altering stored service name fields',
  settings.includes('function serviceDisplayLabel(row={})')&&settings.includes('<td>${esc(serviceDisplayLabel(r))}</td>')&&
  settings.includes('value="${esc(row.name||\'\')}"')&&settings.includes("payload.serviceCode=String(payload.serviceCode||'').trim()"));
check('Appointment Settings geography table uses canonical region/city/district display owner',
  settings.includes("geographyDisplayLabel('district',r.id,r.name)")&&settings.includes("geographyDisplayLabel('city',r.city_id,r.city)")&&settings.includes("geographyDisplayLabel('region',r.region_id,r.region)")&&
  settings.includes('window.KYUMGeography?.loadCatalog?.(false)?.catch?.(()=>null)')&&settings.includes('name_en:row.name_en||row.nameEn||previous.name_en||previous.nameEn||\'\''));
check('Appointment Settings keeps the Excel upload button synchronized with current language',
  settings.includes("if(existing){existing.textContent=tr('appointmentSettings.excel.upload','Upload Services Excel');return;}")&&
  keys.has('appointmentSettings.excel.upload'));
check('Canonical geography owner still returns real name_en for English region/city/district display',
  geography.includes('function localizedGeographyLabel(type = "district", id = "", fallbackName = "")')&&
  geography.includes('if (row) return localizedName(row) || normalizedFallback;')&&geography.includes('localizedGeographyLabel,'));

check('Appointment Reports routes screen/PDF/summary/ranking service names through one service display helper',
  reports.includes('const serviceLabel=value=>')&&
  reports.includes('esc(serviceLabel(svc))')&&reports.includes('esc(serviceLabel(r.service))')&&reports.includes('esc(serviceLabel(r))')&&reports.includes('serviceRanking('));
check('Appointment Scheduling routes service labels through display localization only',
  scheduling.includes('const serviceLabel=')&&scheduling.includes('serviceLabel(s)')&&scheduling.includes('serviceLabel(service)'));
check('Appointment Completion routes service labels/options through display localization only',
  completion.includes('const serviceLabel=')&&completion.includes('${esc(serviceLabel(x))}')&&completion.includes('${esc(serviceLabel(x))}</option>'));
check('Appointments add/edit/view service selectors use canonical entityText display owner',
  installations.includes("appointmentEntity('service',item.id,item.name)")&&
  installations.includes("appointmentEntity('service',service.serviceTypeId||service.service_type_id||service.id")&&
  installations.includes("if(label)label.textContent=service?appointmentEntity('service',service.id,service.name)"));

check('Vehicle Treasury localizes system-generated no-invoice/cash-invoice descriptors only at render time',
  treasury.includes("if (raw==='بدون فاتورة') return t('vehicleTreasury.reference.noInvoice','No invoice')")&&
  treasury.includes("raw.match(/^فاتورة نقدية")&&treasury.includes('esc(referenceLabel(x.reference))')&&treasury.includes('esc(descriptionLabel(x.description))'));
check('Vehicle Treasury stored save/edit payloads remain untouched by display helpers',
  !treasury.includes('descriptionLabel(payload')&&!treasury.includes('referenceLabel(payload')&&!treasury.includes('descriptionLabel(record')&&!treasury.includes('referenceLabel(record'));

const updatedOwner=app.match(/window\.addEventListener\("petatoe-localization-updated", \(\) => \{[\s\S]*?\n\}\);/)?.[0]||'';
check('Localization data refresh re-renders Customers/Follow-ups/Contracts cache banners in current language',
  updatedOwner.includes('refreshReferenceLocalizationLabels();')&&
  updatedOwner.includes('showDataStatus("customersStatus", formatOfflineCacheStatus')&&
  updatedOwner.includes('showDataStatus("followupsStatus", formatOfflineCacheStatus')&&
  updatedOwner.includes('showDataStatus("quotationsStatus", formatOfflineCacheStatus'));
check('Cache banner formatter uses canonical translation keys instead of hard-coded display text',
  app.includes('customerT("shared.cache.lessMinute"')&&app.includes('customerT("shared.cache.minutes"')&&app.includes('customerT("shared.cache.hours"')&&app.includes('customerT("shared.cache.days"'));

const refs=new Set();
for(const name of fs.readdirSync(path.join(ROOT,'assets/js')).filter(x=>x.endsWith('.js'))){
  const src=read(`assets/js/${name}`);
  for(const m of src.matchAll(/(?:\b(?:t|tr|l1T|customerT|appointmentT|geoT)\s*\(|PetatoeLocalization\?\.t\?\.\s*\()\s*["']([^"']+)["']/g))refs.add(m[1]);
}
for(const m of html.matchAll(/data-(?:petatoe|execution)-i18n(?:-(?:aria|title|placeholder|alt))?=["']([^"']+)["']/g))refs.add(m[1]);
check('All literal runtime/static localization references resolve',[...refs].every(k=>keys.has(k)));
let staticDebt=0;
for(const line of html.split(/\r?\n/)){
  if(!AR.test(line)||/data-(?:petatoe|execution)-i18n/.test(line))continue;
  staticDebt += [...line.matchAll(/(?:placeholder|title|aria-label)=["']([^"']*[\u0600-\u06FF][^"']*)["']/g)].length;
  staticDebt += [...line.matchAll(/>([^<>]*[\u0600-\u06FF][^<>]*)</g)].length;
}
check('Static HTML uncovered Arabic candidates remain zero',staticDebt===0);

const viewsBlock=app.match(/const views = \{([\s\S]*?)\n\};/)?.[1]||'';
const viewKeys=[...viewsBlock.matchAll(/^\s*([A-Za-z0-9_]+):\s*document\.getElementById/gm)].map(m=>m[1]);
const headerMetaBlock=app.match(/const PAGE_META_I18N_KEYS = Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1]||'';
const headerMetaKeys=[...headerMetaBlock.matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map(m=>m[1]);
check('R44R38R2 header owner remains intact with metadata for all 52 views',viewKeys.length===52&&headerMetaKeys.length===52&&viewKeys.every(k=>headerMetaKeys.includes(k))&&new Set(headerMetaKeys).size===52);
check('Header title/subtitle remain detached from static Dashboard binding',/id="pageTitle"\s+data-petatoe-page-meta="title"/.test(html)&&/id="pageSubtitle"\s+data-petatoe-page-meta="subtitle"/.test(html)&&!/id="pageTitle"[^>]*data-petatoe-i18n=/.test(html));

const expectedCache='petatoe-pwa-18-56-92-l7-semantic-display-closure-r44r38r3-p5-13-8-72';
const tokens=[...html.matchAll(/[?&]v=(18\.\d+\.\d+)/g)].map(m=>m[1]);
check('R44R38R3 version/build/package/PWA/cache are aligned',version.version==='18.56.92'&&version.build===185692&&pkg.version==='18.56.92'&&read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.92";')&&read('service-worker.js').includes(expectedCache)&&version.cacheToken===expectedCache);
check('All 97 local CSS/JS asset tokens are 18.56.92',tokens.length===97&&tokens.every(v=>v==='18.56.92'));
check('R44R38R3 release metadata and localized update notes are aligned',manifest.release?.phase==='R44R38R3'&&manifest.release?.version==='18.56.92'&&manifest.release?.build===185692&&version.titleI18nKey==='pwa.update.release.r44r38r3.title'&&version.notesI18nKeys?.length===3&&version.notesI18nKeys.every(k=>keys.has(k)));

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
'assets/js/sea-vibe-payroll-service.js':'9d12f4df1a6f40e0c495ac760cef181ea1e5df904927c0f71963e2ea3864f574'
};
check('Protected Offline/Sync/Permissions/business service owners remain byte-identical',Object.entries(protectedHashes).every(([f,h])=>sha(f)===h));
check('All 269 SQL migrations remain byte-identical to R44R38R2',aggregate(fs.readdirSync(path.join(ROOT,'supabase/migrations')).filter(x=>x.endsWith('.sql')).map(x=>`supabase/migrations/${x}`))==='db0df2215140274d7f6ddb4d607141d8f3e8fb55feb81c0e934e8ab23048fe52');
check('R44 pruning remains byte-identical and disabled',sha('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql')==='60ac42da073c1693c31d13ce5b7dd5ae954ca7b0005261e6e36722ab22cd0af9'&&/execution_enabled\s*=\s*false/.test(read('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql')));

const physical=fs.readdirSync(path.join(ROOT,'supabase/migrations')).filter(x=>x.endsWith('.sql')).map(x=>`supabase/migrations/${x}`).sort();
const inventoried=new Set((manifest.historicalInventory||[]).map(x=>x.path));
const extras=physical.filter(x=>!inventoried.has(x));
const expectedExtras=['supabase/migrations/PETATOE-Jeddah-Neighborhood-Translation-Backfill.sql','supabase/migrations/PETATOE-Remaining-23-Neighborhoods-English-Backfill.sql','supabase/migrations/R44R37R2R1-Recovery.sql'].sort();
check('No SQL drift added; pre-existing 269 physical vs 266 manifest HOLD is unchanged',physical.length===269&&manifest.inventoryStats?.sqlFileCount===266&&extras.length===3&&extras.every((x,i)=>x===expectedExtras[i]));

console.log(`R44R38R3 semantic display closure certification: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);
