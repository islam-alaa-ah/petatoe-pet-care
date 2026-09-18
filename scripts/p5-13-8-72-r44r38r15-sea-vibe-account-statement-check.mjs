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
const migration='supabase/migrations/phase_p5_13_8_72_r44r38r15_sea_vibe_account_statement.sql';
const sql=read(migration);
const checks=[]; const check=(name,value)=>checks.push([name,Boolean(value)]);
check('release version 18.56.112',version.version==='18.56.112'&&pkg.version==='18.56.112');
check('release build 185712',version.build===185712);
check('manifest release R44R38R15',manifest.release?.phase==='R44R38R15'&&manifest.release?.version==='18.56.112'&&manifest.release?.build===185712);
check('all index cache tokens use 18.56.112',(()=>{const xs=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(x=>x[1]);return xs.length>0&&xs.every(x=>x==='18.56.112')})());
check('PWA current version aligned',read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.112"'));
check('service worker cache aligned',read('service-worker.js').includes('petatoe-pwa-18-56-112-sea-vibe-account-statement-r44r38r15'));
check('production R15 SQL byte-identical',sha(migration)==='87dc4790d1c338a46ad765e607af5ec1b3d149c800d4064cdd2ec16bb76ab906');
check('R15 migration inventoried',(()=>{const e=manifest.historicalInventory.find(x=>x.path===migration);return e&&e.sha256===sha(migration)&&e.bytes===fs.statSync(path.join(root,migration)).size})());
check('manifest stats consistent',manifest.inventoryStats.sqlFileCount===manifest.historicalInventory.length&&manifest.inventoryStats.totalBytes===manifest.historicalInventory.reduce((n,x)=>n+Number(x.bytes||0),0));
check('known three-file manifest drift preserved',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-manifest.inventoryStats.sqlFileCount===3);
check('sidebar account statement registered in HTML',html.includes('data-view="seaVibeAccountStatement"')&&html.includes('data-petatoe-i18n="sidebar.seaVibeAccountStatement"'));
check('account statement view exists once',html.match(/id="seaVibeAccountStatementView"/g)?.length===1);
check('account statement controls exist', ['seaVibeAccountStatementAccountSearch','seaVibeAccountStatementAccount','seaVibeAccountStatementFrom','seaVibeAccountStatementTo','seaVibeAccountStatementShowBtn','seaVibeAccountStatementBody'].every(id=>html.includes(`id="${id}"`)));
check('four accounting KPI cards exist', ['seaVibeAccountStatementOpening','seaVibeAccountStatementDebit','seaVibeAccountStatementCredit','seaVibeAccountStatementClosing'].every(id=>html.includes(`id="${id}"`)));
check('app view map includes account statement',app.includes('seaVibeAccountStatement: document.getElementById("seaVibeAccountStatementView")'));
check('page metadata uses central localization',app.includes('seaVibeAccountStatement: ["seaVibe.page.accountStatement.title", "seaVibe.page.accountStatement.subtitle"]'));
check('service account picker RPC wired',service.includes("rpc('sea_vibe_account_statement_accounts_r44r38r15'"));
check('service statement RPC wired',service.includes("rpc('sea_vibe_account_statement_r44r38r15'"));
check('service permission is independent view-only screen',service.includes("permission('seaVibeAccountStatement','view')"));
check('UI account search and selector rendering exist',ui.includes('function accountStatementAccountOptions')&&ui.includes('renderAccountStatementAccountOptions'));
check('UI date range validation exists',ui.includes("if(!from||!to||from>to)"));
check('UI result search exists',ui.includes('seaVibeAccountStatementMovementSearch')&&ui.includes('renderAccountStatement'));
check('UI source labels cover journals and vouchers',ui.includes("kind==='journal'")&&ui.includes("kind==='receipt_voucher'")&&ui.includes("kind==='payment_voucher'"));
check('R15 activation bypasses unrelated snapshot writes',ui.includes("if(view==='seaVibeAccountStatement'){ensureAccountStatementDates();await ensureAccountStatementAccounts();renderAccountStatement()"));
check('account statement CSS stays inside canonical SEA VIBE owner',css.includes('.sea-vibe-account-statement-result-tools')&&css.includes('.sea-vibe-account-statement-table'));
check('central localization contains all R15 screen keys',loc.includes('sidebar.seaVibeAccountStatement')&&loc.includes('seaVibe.accountStatement.runningBalance')&&loc.includes('seaVibe.accountStatement.sourcePayment'));
check('release localization keys present',loc.includes('pwa.update.release.r44r38r15.title')&&loc.includes('pwa.update.release.r44r38r15.note3'));
check('SQL uses posted journals only',sql.includes("where j.status='posted'"));
check('SQL includes treasury voucher entries',sql.includes('sea_vibe_treasury_voucher_entries'));
check('SQL supports recursive descendants',sql.includes('with recursive account_scope'));
check('SQL opening balance uses movements before from date',sql.includes('where movement_date<p_from_date'));
check('SQL has no destructive DML/DDL',!(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+(table|view|column|schema)\b/i.test(sql)));
check('SQL does not alter RLS/policies',!(/\b(create|drop|alter)\s+policy\b/i.test(sql))&&!(/enable\s+row\s+level\s+security/i.test(sql)));
check('R14R6 HOLD code not merged into R15 frontend',!service.includes('sea_vibe_save_treasury_voucher_r44r38r14r6')&&!html.includes('seaVibeTreasuryVoucherPaymentLines'));
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
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)passed++;}
console.log(`\nR44R38R15 certification: ${passed}/${checks.length} PASS`);if(passed!==checks.length)process.exit(1);
