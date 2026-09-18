import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const html=read('index.html');
const app=read('assets/js/app.js');
const ui=read('assets/js/appointment-historical-import.js');
const service=read('assets/js/appointment-historical-import-service.js');
const css=read('assets/css/appointment-historical-import.css');
const loc=read('assets/js/localization-center.js');
const sw=read('service-worker.js');
const pwa=read('assets/js/pwa.js');
const offlinePolicy=JSON.parse(read('enterprise-offline-policy.json'));
const r20='supabase/migrations/phase_p5_13_8_72_r44r38r20_appointment_historical_data_import.sql';
const r20r1='supabase/migrations/phase_p5_13_8_72_r44r38r20r1_historical_import_schema_recovery.sql';
const sql=read(r20r1);
const checks=[]; const check=(name,value)=>checks.push([name,Boolean(value)]);

check('release version 18.56.121',version.version==='18.56.121'&&pkg.version==='18.56.121');
check('release build 185721',version.build===185721);
check('manifest release R44R38R20R2',manifest.release?.phase==='R44R38R20R2'&&manifest.release?.version==='18.56.121'&&manifest.release?.build===185721);
check('all index cache tokens use 18.56.121',(()=>{const xs=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(x=>x[1]);return xs.length>0&&xs.every(x=>x==='18.56.121')})());
check('PWA version updated',pwa.includes('const CURRENT_VERSION = "18.56.121"'));
check('service-worker cache updated',sw.includes('petatoe-pwa-18-56-121-appointment-historical-import-r44r38r20r2'));

check('data import nav is under appointments',html.includes('data-view="appointmentDataImport"')&&html.indexOf('data-view="installationReports"')<html.indexOf('data-view="appointmentDataImport"')&&html.indexOf('data-view="appointmentDataImport"')<html.indexOf('data-view="vehicleTreasury"'));
check('data import view exists',html.includes('id="appointmentDataImportView"')&&html.includes('id="appointmentHistoricalImportPreviewBody"'));
check('view contains template choose validate import and failed export controls',['appointmentHistoricalImportTemplateBtn','appointmentHistoricalImportChooseBtn','appointmentHistoricalImportValidateBtn','appointmentHistoricalImportExecuteBtn','appointmentHistoricalImportFailedExportBtn'].every(id=>html.includes(`id="${id}"`)));
check('import controls use independent permission key',html.includes('data-permission-screen="appointmentDataImport" data-permission-action="view"')&&html.includes('data-permission-screen="appointmentDataImport" data-permission-action="add"')&&html.includes('data-permission-screen="appointmentDataImport" data-permission-action="export"'));
check('app view registry includes import screen',app.includes('appointmentDataImport: document.getElementById("appointmentDataImportView")'));
check('page metadata uses localization keys',app.includes('appointmentDataImport: ["appointmentDataImport.title", "appointmentDataImport.note"]'));

const headers=['اسم الصنف','السيارة','التاريخ','الشهر','رقم الفاتورة','العميل','سعر الوحدة','الكمية','الخصم','الضريبة','المبيعات شامل الضريبة','المبيعات قبل الضريبة','طريقة السداد'];
check('exact thirteen approved Excel headers are implemented',headers.every(h=>ui.includes(`ar:'${h}'`))&&((ui.match(/Object\.freeze\(\{key:/g)||[]).length===13));
check('XLS and XLSX accepted',ui.includes("/\\.(xlsx|xls)$/i")&&html.includes('accept=".xlsx,.xls"'));
check('Excel file hash captured for batch identity',ui.includes("digest('SHA-256'")&&ui.includes('state.fileSha256'));
check('validation preview is chunked with visible progress',ui.includes('VALIDATION_CHUNK=400')&&ui.includes('appointmentDataImport.progress.validating')&&ui.includes('setProgress('));
check('preview exposes customer match status',ui.includes('customerMatchStatus')&&ui.includes('matchedCustomerNumber')&&ui.includes('matchedCustomerName'));
check('failed rows can be exported to Excel',ui.includes('exportFailedRows')&&ui.includes("XLSX.writeFile")&&ui.includes('PETATOE_Historical_Import_Failed_'));
check('template can be generated from canonical headers',ui.includes('downloadTemplate')&&ui.includes('TEMPLATE_HEADERS')&&ui.includes('PETATOE_Historical_Sales_Import_Template.xlsx'));
check('read-only users may choose and validate while add is required only to import',ui.includes("if(choose) choose.disabled=state.busy||!can('view');")&&ui.includes("!can('add')")&&service.includes("requirePermission('add')"));

check('service uses only approved R20 validation and import RPCs',service.includes("VALIDATE_RPC='validate_appointment_historical_sales_r44r38r20'")&&service.includes("IMPORT_RPC='import_appointment_historical_sales_r44r38r20'")&&((service.match(/\.rpc\(/g)||[]).length===2));
check('validation and import are online-only without touching offline queue',service.includes('navigator.onLine===false')&&!service.includes('OfflineQueue')&&!service.includes('offline-queue'));
check('historical import service is explicitly registered as accepted online-only',offlinePolicy.domains?.appointment_historical_import?.file==='assets/js/appointment-historical-import-service.js'&&offlinePolicy.domains?.appointment_historical_import?.status==='accepted_online_only'&&offlinePolicy.registeredDirectDataFiles.includes('assets/js/appointment-historical-import-service.js'));
check('customer code first then mobile and never name-only in approved recovery',sql.includes('No name-only matching is ever performed.')&&sql.indexOf("v_method:='legacy_code'")<sql.indexOf("v_method:='mobile'"));
check('unspecified items remain accepted historical data',sql.includes('ITEM_UNSPECIFIED')&&sql.includes('item_is_unspecified'));
check('zero-tax source totals are preserved with mismatch warning',sql.includes("'ZERO_TAX_TOTAL_MISMATCH'")&&sql.includes('v_tax=0'));
check('confirmed July source correction is installed',sql.includes('DATE_EXCEL_SERIAL_DAY_MONTH_CORRECTED')&&sql.includes("appointment_historical_import_date_r44r38r20('46060','july')")&&sql.includes("='2026-07-02'"));
check('cash aggregate rows have explicit record type',sql.includes("'cash_aggregate'")&&sql.includes('record_type'));

check('canonical import CSS is dedicated and has no important overrides',css.includes('.appointment-history-import-view')&&!css.includes('!important'));
check('import CSS includes desktop tablet mobile responsiveness',css.includes('@media(max-width:1100px)')&&css.includes('@media(max-width:720px)'));
check('Arabic English localization covers screen rules and customer matching',loc.includes('appointmentDataImport.nav')&&loc.includes('appointmentDataImport.rule.customerMatch')&&loc.includes('appointmentDataImport.match.code')&&loc.includes('appointmentDataImport.match.mobile'));
check('R20R2 release localization exists',loc.includes('pwa.update.release.r44r38r20r2.title')&&loc.includes('pwa.update.release.r44r38r20r2.note3'));
check('all literal import localization references have bundled translations',(()=>{const keys=new Set([...loc.matchAll(/\["([^"]+)"\s*,/g)].map(x=>x[1]));const refs=new Set();for(const source of [html,app,ui,service])for(const match of source.matchAll(/appointmentDataImport\.[A-Za-z0-9_.]+/g))if(match[0]!=='appointmentDataImport.code.')refs.add(match[0]);return [...refs].every(key=>keys.has(key))})());
check('all authoritative R20 validation codes have bundled translations',(()=>{const keys=new Set([...loc.matchAll(/\["([^"]+)"\s*,/g)].map(x=>x[1]));const codes=new Set();for(const re of [/jsonb_build_array\('([A-Z][A-Z0-9_]+)'\)/g,/v_code:='([A-Z][A-Z0-9_]+)'/g,/v_warning:='([A-Z][A-Z0-9_]+)'/g])for(const match of sql.matchAll(re))codes.add(match[1]);return [...codes].every(code=>keys.has(`appointmentDataImport.code.${code}`))})());
check('service worker includes new import assets',['./assets/css/appointment-historical-import.css','./assets/js/appointment-historical-import-service.js','./assets/js/appointment-historical-import.js'].every(x=>sw.includes(`"${x}"`)));

check('production R20 foundation SQL byte-identical',sha(r20)==='43a9d7e3a1127e97b26c92c28e01f3b5c9256b1c8cbedaec6f54323cffca2dda');
check('production R20R1 recovery SQL byte-identical',sha(r20r1)==='08d0f108276638bb65b643cc147b23ac6085b7c3acedd7f5270fbe31c764a6b9');
check('only production-used R20 migrations are present',!fs.existsSync(path.join(root,'supabase/migrations/phase_p5_13_8_72_r44r38r20_revised.sql')));
check('R20 migrations are inventoried with correct fingerprints',[r20,r20r1].every(rel=>{const e=manifest.historicalInventory.find(x=>x.path===rel);return e&&e.sha256===sha(rel)&&e.bytes===fs.statSync(path.join(root,rel)).size}));
check('manifest stats match inventory',manifest.inventoryStats.sqlFileCount===manifest.historicalInventory.length&&manifest.inventoryStats.totalBytes===manifest.historicalInventory.reduce((n,x)=>n+Number(x.bytes||0),0));
check('legacy three-file manifest drift preserved',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-manifest.inventoryStats.sqlFileCount===3);
check('R20 execution order registered in certified tail',manifest.policy.certifiedRecentTailOrder.slice(-2).join('|')===`${r20}|${r20r1}`);

const protectedHashes={
  'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
  'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
  'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
  'assets/js/sync-retention.js':'4b98c05457eaa859cc70fc9779bb7f8c9490bdfc70976b233814d8a45452835b',
  'assets/js/permissions.js':'433c463180df94420c706fe55a5a13b3b8d69c6d1c92b59c0ad4674946e91f34',
  'assets/js/permissions-service.js':'e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a',
  'assets/js/installations-service.js':'8749ff95e4afda0f0bd9bfe038d0e68694219a2ad677f08d8a5585a871129153',
  'assets/js/installations-module.js':'9c2be707b71b067a6f3009c54470375dcdc2f5e609109171071a5ca62ba11b4a',
  'assets/js/sales-invoices-service.js':'f5199ee2071b7bf060842c24752d1de116e9dc88d8cba590022b001302f7629e'
};
check('protected Offline Sync permissions appointment and invoice architecture byte-identical to R19R1',Object.entries(protectedHashes).every(([rel,h])=>sha(rel)===h));
check('R44 pruning remains untouched',!ui.match(/prun(ing|e)/i)&&!service.match(/prun(ing|e)/i));

let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)passed++;}
console.log(`\nR44R38R20R2 certification: ${passed}/${checks.length} PASS`);
if(passed!==checks.length)process.exit(1);
