import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(ROOT,rel));
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,rel))).digest('hex');
let pass=0,fail=0;
function check(label,condition){if(condition){console.log(`PASS - ${label}`);pass++;}else{console.error(`FAIL - ${label}`);fail++;}}

const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const html=read('index.html');
const app=read('assets/js/app.js');
const loc=read('assets/js/localization-center.js');
const c360=read('assets/js/customer360-engine.js');
const importHotfix=read('assets/js/customer-excel-actions-hotfix.js');
const pwa=read('assets/js/pwa.js');
const sw=read('service-worker.js');
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const migration='supabase/migrations/phase_p5_13_8_72_r44r33_crm_l2c_reports_customer360_import_localization.sql';
const sql=read(migration);
const expectedVersion='18.56.79';
const expectedBuild=185679;
const cacheToken='petatoe-pwa-18-56-79-crm-l2c-reports-customer360-import-r44r33-p5-13-8-72';

check('R44R33 version/build aligned',version.version===expectedVersion&&version.build===expectedBuild&&pkg.version===expectedVersion);
check('PWA and Service Worker release aligned',pwa.includes(`const CURRENT_VERSION = "${expectedVersion}";`)&&sw.includes(`const CACHE_VERSION = "${cacheToken}";`));
check('index asset tokens aligned',!html.includes('?v=18.56.78')&&(html.match(/\?v=18\.56\.79/g)||[]).length>=90);
check('migration manifest release aligned',manifest.release?.version===expectedVersion&&manifest.release?.build===expectedBuild);

const reportsStatic=['reportsOverview.title','reportsOverview.note','reportsOverview.action.refresh','reportsOverview.action.exportCenter','reportsOverview.filter.from','reportsOverview.filter.to','reportsOverview.filter.representative','reportsOverview.filter.target','reportsOverview.filter.reset'];
check('Reports Overview static localization wired',reportsStatic.every(k=>html.includes(`data-petatoe-i18n="${k}"`)));
check('Reports Overview runtime uses canonical localization',app.includes('function reportsMonthLabel(')&&app.includes('l1Locale()')&&app.includes('reportsOverview.format.acceptedConversion')&&app.includes('reportsOverview.updatedAt'));
check('Reports Overview rerenders on language change',app.includes('current === "reportsOverview" && currentReportsSnapshot')&&app.includes('renderReportsOverview()'));

const c360Keys=['customer360.status.active','customer360.risk.noFollowup','customer360.next.openContracts','customer360.valueTier.strategic'];
check('Customer 360 engine uses canonical localization',c360Keys.every(k=>c360.includes(k))&&c360.includes('window.PetatoeLocalization?.t?.'));
check('Customer 360 dialog rerenders on language change',app.includes('customer360Dialog?.open')&&app.includes('showCustomerDetails(customer360Dialog.dataset.customerId)'));
check('Customer 360 business engine remains display-only change',sha('assets/js/reports-engine.js')==='007dbbeb65af90e15f885272dc31bf1e5eb663f4da1b5632dc74a12dc8c584b4');

const importStatic=['customerImport.title','customerImport.note','customerImport.chooseFile','customerImport.progress.title','customerImport.summary.total','customerImport.summary.valid'];
check('Customer Excel static localization wired',importStatic.every(k=>html.includes(`data-petatoe-i18n="${k}"`)));
check('Customer Excel runtime localized',importHotfix.includes('customerImport.runtime.xlsxLoad')&&app.includes('function customerImportMessage(')&&app.includes('customerImport.preview.limited'));
check('Customer Excel dialog rerenders on language change',app.includes('customerImportDialog')&&app.includes('renderCustomerImportPreview(customerImportPreview)'));

check('CRM service errors stay in display layer',loc.includes('crmService.customer.conflict')&&loc.includes('crmService.followup.conflict')&&loc.includes('crmService.contract.conflict')&&loc.includes('function translateMessage(message)'));
check('customer service byte-identical to R44R32',sha('assets/js/customers-service.js')==='91904ddcfb757060f96b3a8a2208e22cb3436fcb204c4c33556c939b94e544ab');
check('followup service byte-identical to R44R32',sha('assets/js/followups-service.js')==='5df43e64709126d4fee8dc83e7a852425c711a06d28d3506b5e78b63082486e5');
check('quotation service byte-identical to R44R32',sha('assets/js/quotations-service.js')==='45ae2c89a071bb2dfa7261229e53c35e9a24be68318fc21687a998dc92b58e1a');
check('offline queue byte-identical to R44R32',sha('assets/js/offline-queue.js')==='5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7');
check('smart cache byte-identical to R44R32',sha('assets/js/smart-cache.js')==='b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d');
check('sync engine byte-identical to R44R32',sha('assets/js/sync-engine.js')==='7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e');
check('generated export owners untouched for L6',sha('assets/js/export-center.js')==='46114bbefe42832d274777e02f352af772b1cb737ebf620fdd365820a5d420cc'&&sha('assets/js/customer360-export.js')==='42db55e49ed216b98d11d35a66530efdf953da2810630978ff6ab72d3595fabb');

const addedPrefixes=['reportsOverview.','customer360.','customerImport.','crmService.'];
check('new localization namespaces routed',loc.includes("value.startsWith('reportsOverview.')")&&loc.includes("value.startsWith('customer360.')||value.startsWith('customerImport.')")&&loc.includes("value.startsWith('crmService.')"));
const sqlKeys=[...sql.matchAll(/\('([^']+)'\s*,/g)].map(m=>m[1]);
check('R44R33 migration has 444 translation keys',sqlKeys.length===444&&new Set(sqlKeys).size===444);
check('R44R33 migration is non-destructive',!/\b(?:delete\s+from|truncate|drop\s+(?:table|schema)|alter\s+table[^;]+drop)\b/i.test(sql));
check('R44R33 migration preserves custom translations',sql.includes("case when nullif(btrim(public.app_translations.ar_text),'') is null")&&sql.includes("case when nullif(btrim(public.app_translations.en_text),'') is null"));
const inv=manifest.historicalInventory?.find?.(x=>x.path===migration);
check('R44R33 migration inventoried with matching fingerprint',Boolean(inv)&&inv.sha256===sha(migration)&&inv.bytes===fs.statSync(path.join(ROOT,migration)).size);
check('R44R33 migration in certified order',manifest.policy?.certifiedRecentTailOrder?.includes?.(migration));
check('R44R33 release localization keys exist',['pwa.update.release.r44r33.title','pwa.update.release.r44r33.note1','pwa.update.release.r44r33.note2','pwa.update.release.r44r33.note3'].every(k=>loc.includes(`["${k}"`)));
check('no visible initial Arabic customer pagination residue',html.includes('id="customersPaginationInfo">0</span>')&&!html.includes('id="customersPaginationInfo">0 عميل</span>'));

console.log(`R44R33 certification: ${pass}/${pass+fail} PASS`);
if(fail)process.exit(1);
