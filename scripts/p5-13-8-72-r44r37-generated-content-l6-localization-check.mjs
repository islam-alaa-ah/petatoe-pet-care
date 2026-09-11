import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
const ROOT=process.cwd();
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex');
const shaText=s=>crypto.createHash('sha256').update(s).digest('hex');
let pass=0,fail=0;const check=(n,c)=>{console.log(`${c?'PASS':'FAIL'} - ${n}`);c?pass++:fail++;};
const migration='supabase/migrations/phase_p5_13_8_72_r44r37_generated_content_l6_localization.sql';
const sql=read(migration),manifest=JSON.parse(read('supabase/migration-manifest.json'));
const loc=read('assets/js/localization-center.js');
const sandbox={console:{warn(){},log(){},error(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},documentElement:{},body:{}},CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setTimeout(){return 0;},clearTimeout(){},window:{screen:{width:0},matchMedia(){return{matches:false};},dispatchEvent(){},addEventListener(){}}};sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;
vm.runInNewContext(loc,sandbox,{filename:'localization-center.js'});const rows=sandbox.window.PetatoeLocalization.getRows();const keys=new Set(rows.map(x=>x.key));const ar=/[\u0600-\u06FF]/;
check('Localization catalog Arabic/English parity is intact',rows.every(x=>String(x.ar||'').trim()&&String(x.en||'').trim()&&!ar.test(String(x.en||''))));
const targets=['index.html','assets/js/notification-center.js','assets/js/mobile.js','assets/js/customer-excel-center.js','assets/js/installation-operations-reports.js','assets/js/export-center.js','assets/js/reports-engine.js','assets/js/daily-performance-service.js','assets/js/customer360-export.js','assets/js/app.js'];
const refs=new Set();for(const f of targets){const src=read(f);for(const re of [/data-petatoe-i18n(?:-[a-z]+)?=["']([^"']+)["']/g,/\b(?:t|l1T|sharedT)\(\s*["']([^"']+)["']/g])for(const m of src.matchAll(re))refs.add(m[1]);}
check('All literal L6 localization references resolve',[...refs].every(k=>keys.has(k)));
const html=read('index.html'),notify=read('assets/js/notification-center.js'),mobile=read('assets/js/mobile.js'),custExcel=read('assets/js/customer-excel-center.js'),ops=read('assets/js/installation-operations-reports.js'),exp=read('assets/js/export-center.js'),reports=read('assets/js/reports-engine.js'),daily=read('assets/js/daily-performance-service.js'),c360=read('assets/js/customer360-export.js'),app=read('assets/js/app.js');
check('Notification Center static surface uses canonical localization keys',html.includes('data-petatoe-i18n="shared.notifications.center.title"')&&html.includes('data-petatoe-i18n-aria="shared.notifications.center.roleAria"')&&html.includes('data-petatoe-i18n="shared.notifications.center.matrixTitle"'));
check('Notification Center runtime translates service messages and event labels',notify.includes('function uiMessage(')&&notify.includes('function eventLabel(')&&notify.includes('notificationTitle(n)')&&notify.includes('notificationBody(n)'));
check('Notification relative dates are Gregorian with Latin digits',notify.includes("en-GB-u-ca-gregory-nu-latn")&&notify.includes("ar-SA-u-ca-gregory-nu-latn"));
check('Customer Excel generated sheets/templates are localized',custExcel.includes("customerImport.template.sheetCustomers")&&custExcel.includes("customerImport.template.sheetInstructions")&&custExcel.includes("customerImport.template.sheetFailed"));
check('Customer 360 Excel/PDF generated content is localized',c360.includes("customer360.export.reportTitle")&&c360.includes("customer360.export.sheetSummary")&&c360.includes("customer360.export.footer")&&c360.includes('dir="${dir()}"'));
check('Executive report Excel/PDF generated content is localized',exp.includes("reportsOverview.export.executiveSalesReport")&&exp.includes("reportsOverview.export.sheetSummary")&&exp.includes("reportsOverview.export.footer"));
check('Executive report CSV generated content is localized',reports.includes("reportsOverview.export.csvTitle")&&reports.includes("reportsOverview.export.stageConversion")&&reports.includes("lang==='en'?item.label:item.arabic"));
check('Daily performance CSV generated content is localized',daily.includes("dailyPerformance.export.csv.title")&&daily.includes("dailyPerformance.export.generatedAt")&&daily.includes("dailyPerformance.export.completed")&&daily.includes("dailyPerformance.export.notCompleted"));
check('Appointment operations generated reports are localized',ops.includes('appointments.reports.export.')&&ops.includes('PetatoeLocalization'));
check('Mobile generated quotation print/share content is localized',mobile.includes('contracts.export.')&&mobile.includes('shared.export.'));
check('Filtered reports and WhatsApp/PDF generated content is localized',app.includes('followups.export.title')&&app.includes('contracts.export.title')&&app.includes('shared.export.filteredWhatsappMessage')&&app.includes('dailyPerformance.export.activity.whatsappMessage'));
const reportPrefix=reports.split('  function toCsv(report) {')[0];const dailyPrefix=daily.split('  function toCsv(report) {')[0];
check('Reports Engine calculation/build logic before CSV owner is byte-identical',shaText(reportPrefix)==='0ae94459580c6217277a8b99fac3a713046bcb55aeb1e7cb2b93bce8ea5c535c');
check('Daily Performance calculation/build logic before CSV owner is byte-identical',shaText(dailyPrefix)==='c503d4acb34780610e25abc5de9d5ebf68a919cefb17ae4960472509528a54b2');
const protectedHashes={
'assets/js/notification-center-service.js':'3e4e803faa96e540b1dbf6d48d5a913af5c6564d4bd401dbec4b8024cf25ee15',
'assets/js/whatsapp-template-service.js':'b3818328ffe6ed9aade0ff0abfe757eef2cfc9992778ac16019ef4b9d82f6292',
'assets/js/installations-service.js':'8749ff95e4afda0f0bd9bfe038d0e68694219a2ad677f08d8a5585a871129153',
'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456',
'assets/js/payroll-service.js':'9cec5332ba14066b54dce5b0647042cf3e668dd583b41e4e8ab0dde974bfc6e6',
'assets/js/sales-invoices-service.js':'f5199ee2071b7bf060842c24752d1de116e9dc88d8cba590022b001302f7629e',
'assets/js/sea-vibe-service.js':'072c48f7f5da3110e6c1e262ad4023e9d15901bbede66af3ca717615d1f184b1',
'assets/js/sea-vibe-payroll-service.js':'9d12f4df1a6f40e0c495ac760cef181ea1e5df904927c0f71963e2ea3864f574'};
check('Notification/WhatsApp/services and protected business owners are byte-identical',Object.entries(protectedHashes).every(([f,h])=>sha(f)===h));
let cssHash=crypto.createHash('sha256');for(const name of fs.readdirSync(path.join(ROOT,'assets/css')).filter(x=>x.endsWith('.css')).sort()){cssHash.update(name);cssHash.update('\0');cssHash.update(fs.readFileSync(path.join(ROOT,'assets/css',name)));cssHash.update('\0');}
check('All CSS owners are byte-identical — no layer above layer',cssHash.digest('hex')==='82ef9f4afd7060595e4912e0a17b17220928fd49bcbe4c476674f67a5599ce90');
const sqlKeys=[...sql.matchAll(/\('([^']+)'\s*,/g)].map(m=>m[1]);
check('R44R37 migration keys are unique',sqlKeys.length===new Set(sqlKeys).size);
check('R44R37 migration is non-destructive',!/\b(?:delete\s+from|truncate|drop\s+(?:table|schema)|alter\s+table[^;]+drop)\b/i.test(sql));
check('R44R37 migration preserves customized translations',sql.includes("case when nullif(btrim(public.app_translations.ar_text),'') is null")&&sql.includes("case when nullif(btrim(public.app_translations.en_text),'') is null"));
const inv=manifest.historicalInventory?.find?.(x=>x.path===migration);check('R44R37 migration fingerprint is inventoried',Boolean(inv)&&inv.sha256===sha(migration)&&inv.bytes===fs.statSync(path.join(ROOT,migration)).size);
check('R44R37 migration is in certified recent tail',manifest.policy?.certifiedRecentTailOrder?.includes?.(migration));
check('Manifest inventory includes 262 SQL migrations',manifest.inventoryStats?.sqlFileCount===262&&manifest.historicalInventory?.length===262);
const version=JSON.parse(read('version.json'));const final=version.version==='18.56.83';
if(final){const pkg=JSON.parse(read('package.json'));const pwa=read('assets/js/pwa.js'),sw=read('service-worker.js');check('R44R37 version/build/cache aligned',version.build===185683&&pkg.version==='18.56.83'&&pwa.includes('const CURRENT_VERSION = "18.56.83";')&&sw.includes('petatoe-pwa-18-56-83-generated-content-l6-r44r37-p5-13-8-72'));check('R44R37 release localization keys resolve',['pwa.update.release.r44r37.title','pwa.update.release.r44r37.note1','pwa.update.release.r44r37.note2','pwa.update.release.r44r37.note3'].every(k=>keys.has(k)));check('R44R37 migration has 381 translation keys',sqlKeys.length===381);check('Manifest release metadata aligned',manifest.release?.version==='18.56.83'&&manifest.release?.build===185683);}else{check('Pre-version gate stays on R44R36',version.version==='18.56.82'&&version.build===185682);check('Pre-version R44R37 migration has 377 translation keys',sqlKeys.length===377);}
console.log(`R44R37 generated-content L6 certification: ${pass}/${pass+fail} PASS`);if(fail)process.exit(1);
