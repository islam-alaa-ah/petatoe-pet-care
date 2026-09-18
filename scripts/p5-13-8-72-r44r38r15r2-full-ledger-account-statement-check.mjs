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
const ui=read('assets/js/sea-vibe.js');
const service=read('assets/js/sea-vibe-service.js');
const css=read('assets/css/sea-vibe.css');
const loc=read('assets/js/localization-center.js');
const r15='supabase/migrations/phase_p5_13_8_72_r44r38r15_sea_vibe_account_statement.sql';
const r15r1='supabase/migrations/phase_p5_13_8_72_r44r38r15r1_account_statement_expense_link_recovery.sql';
const r15r2='supabase/migrations/phase_p5_13_8_72_r44r38r15r2_full_ledger_link_recovery.sql';
const sql=read(r15r2);
const checks=[]; const check=(name,value)=>checks.push([name,Boolean(value)]);
check('release version 18.56.114',version.version==='18.56.114'&&pkg.version==='18.56.114');
check('release build 185714',version.build===185714);
check('manifest release R44R38R15R2',manifest.release?.phase==='R44R38R15R2'&&manifest.release?.version==='18.56.114'&&manifest.release?.build===185714);
check('all index cache tokens use 18.56.114',(()=>{const xs=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(x=>x[1]);return xs.length>0&&xs.every(x=>x==='18.56.114')})());
check('PWA current version aligned',read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.114"'));
check('service worker cache aligned',read('service-worker.js').includes('petatoe-pwa-18-56-114-account-statement-full-ledger-r44r38r15r2'));
check('R15 production SQL byte-identical',sha(r15)==='87dc4790d1c338a46ad765e607af5ec1b3d149c800d4064cdd2ec16bb76ab906');
check('R15R1 production SQL byte-identical',sha(r15r1)==='b37788a21732ff31d014b6b321d31b05cb5ab80df2d28e1b2cbd8ec0210b408f');
check('R15R2 production SQL byte-identical',sha(r15r2)==='a3ad5f5ee25671dc0addf15f18575dd8b7650785ff570f56aff79c81d37d98b6');
check('R15R2 recovery inventoried',(()=>{const e=manifest.historicalInventory.find(x=>x.path===r15r2);return e&&e.sha256===sha(r15r2)&&e.bytes===fs.statSync(path.join(root,r15r2)).size})());
check('manifest stats consistent',manifest.inventoryStats.sqlFileCount===manifest.historicalInventory.length&&manifest.inventoryStats.totalBytes===manifest.historicalInventory.reduce((n,x)=>n+Number(x.bytes||0),0));
check('known three-file manifest drift preserved',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-manifest.inventoryStats.sqlFileCount===3);
check('statement screen remains registered',html.includes('data-view="seaVibeAccountStatement"')&&app.includes('seaVibeAccountStatement: document.getElementById("seaVibeAccountStatementView")'));
check('statement RPC contract unchanged',service.includes("rpc('sea_vibe_account_statement_r44r38r15'"));
check('R15R2 maps trip revenue source in UI',ui.includes("if(kind==='trip_revenue')return t('seaVibe.treasury.tripRevenue','Trip Revenue')"));
check('R15R2 maps fuel topup source in UI',ui.includes("if(kind==='fuel_topup')return t('seaVibe.treasury.fuelTopup','Fuel Top-up')"));
check('R15R2 maps Zawel topup source in UI',ui.includes("if(kind==='zawel_topup')return t('seaVibe.treasury.zawelTopup','Zawel Top-up')"));
check('account statement footer exists',html.includes('class="sea-vibe-account-statement-totals"')&&html.includes('id="seaVibeAccountStatementFooterDebit"')&&html.includes('id="seaVibeAccountStatementFooterCredit"')&&html.includes('id="seaVibeAccountStatementFooterClosing"'));
check('footer displays period debit',ui.includes("$('seaVibeAccountStatementFooterDebit').textContent=money(debit)"));
check('footer displays period credit',ui.includes("$('seaVibeAccountStatementFooterCredit').textContent=money(credit)"));
check('footer displays closing balance',ui.includes("$('seaVibeAccountStatementFooterClosing').textContent=money(closing)"));
check('footer CSS owned by SEA VIBE canonical stylesheet',css.includes('.sea-vibe-account-statement-totals td'));
check('full ledger links trip revenue',sql.includes("'trip_revenue'::text")&&sql.includes('t.revenue_account_id'));
check('full ledger links operational expense counterpart',sql.includes("case when e.system_key='fuel_cost' then v_fuel_balance_id when e.system_key='sailing_permit' then v_zawel_balance_id else v_treasury_id end"));
check('full ledger links fuel topups',sql.includes("'fuel_topup'::text"));
check('full ledger links Zawel topups',sql.includes("'zawel_topup'::text"));
check('new revenue account snapshot columns exist in SQL',sql.includes('revenue_account_id'));
check('R15R2 release localization keys present',loc.includes('pwa.update.release.r44r38r15r2.title')&&loc.includes('pwa.update.release.r44r38r15r2.note3'));
check('R14R6 HOLD code still not merged',!service.includes('sea_vibe_save_treasury_voucher_r44r38r14r6')&&!html.includes('seaVibeTreasuryVoucherPaymentLines'));
const protectedHashes={
 'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
 'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
 'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
 'assets/js/sync-retention.js':'4b98c05457eaa859cc70fc9779bb7f8c9490bdfc70976b233814d8a45452835b',
 'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456',
 'assets/js/permissions-service.js':'e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a',
 'assets/js/sales-invoices.js':'b1677add46d784d84568971d805cc344c20da557b55c2645a82d7f61a1a924bd',
 'assets/js/vehicle-treasury.js':'85a9179bfd4c9a910057d224789ef5b5ff4204c9be5ac90af7ea3389a3b03e10',
 'assets/js/payroll.js':'76a4b0f9fda2025ae1276c8a2b5b070b95d5c14546867de95af47a935c3f1037',
 'assets/js/sea-vibe-payroll.js':'1ba9ad9b56ef7c6e66bff675891b73a7b2de070e65f898705c4e40d81a50b67d'
};
for(const [file,hash] of Object.entries(protectedHashes))check(`protected ${file} byte-identical`,sha(file)===hash);
let passed=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)passed++;}
console.log(`\nR44R38R15R2 certification: ${passed}/${checks.length} PASS`); if(passed!==checks.length)process.exit(1);
