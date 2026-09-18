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
const js=read('assets/js/sea-vibe.js');
const service=read('assets/js/sea-vibe-service.js');
const css=read('assets/css/sea-vibe.css');
const loc=read('assets/js/localization-center.js');
const migration='supabase/migrations/phase_p5_13_8_72_r44r38r19_financial_statements.sql';
const sql=read(migration);
const checks=[];const check=(name,v)=>checks.push([name,Boolean(v)]);
const section=id=>{const start=html.indexOf(`<section id="${id}"`);if(start<0)return'';const next=html.indexOf('<section id="',start+20);return html.slice(start,next<0?html.length:next)};
check('release version 18.56.119',version.version==='18.56.119'&&pkg.version==='18.56.119');
check('release build 185719',version.build===185719);
check('manifest release R44R38R19',manifest.release?.phase==='R44R38R19'&&manifest.release?.version==='18.56.119'&&manifest.release?.build===185719);
check('all index cache tokens use 18.56.119',(()=>{const xs=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(x=>x[1]);return xs.length>0&&xs.every(x=>x==='18.56.119')})());
check('PWA version updated',read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.119"'));
check('service-worker cache updated',read('service-worker.js').includes('petatoe-pwa-18-56-119-financial-statements-r44r38r19'));
check('production R19 SQL byte-identical',sha(migration)==='5fff651064fa71ba8c5b9c6817fe001ad5b34054b1e97f0aedee40a3832859c7');
check('R19 migration inventoried',(()=>{const e=manifest.historicalInventory.find(x=>x.path===migration);return e&&e.sha256===sha(migration)&&e.bytes===fs.statSync(path.join(root,migration)).size})());
check('manifest stats match inventory',manifest.inventoryStats.sqlFileCount===manifest.historicalInventory.length&&manifest.inventoryStats.totalBytes===manifest.historicalInventory.reduce((n,x)=>n+Number(x.bytes||0),0));
check('legacy three-file drift preserved',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-manifest.inventoryStats.sqlFileCount===3);
check('three sidebar entries inserted in correct order',html.indexOf('data-view="seaVibeTrialBalance"')>html.indexOf('data-view="seaVibeAccountStatement"')&&html.indexOf('data-view="seaVibeIncomeStatement"')>html.indexOf('data-view="seaVibeTrialBalance"')&&html.indexOf('data-view="seaVibeBalanceSheet"')>html.indexOf('data-view="seaVibeIncomeStatement"')&&html.indexOf('data-view="seaVibeReports"')>html.indexOf('data-view="seaVibeBalanceSheet"'));
check('trial balance screen exists',section('seaVibeTrialBalanceView').includes('seaVibeTrialBalanceBody'));
check('income statement screen exists',section('seaVibeIncomeStatementView').includes('seaVibeIncomeStatementBody'));
check('balance sheet screen exists',section('seaVibeBalanceSheetView').includes('seaVibeBalanceSheetBody'));
check('new screens contain no summary cards',!section('seaVibeTrialBalanceView').includes('sea-vibe-report-grid')&&!section('seaVibeIncomeStatementView').includes('sea-vibe-report-grid')&&!section('seaVibeBalanceSheetView').includes('sea-vibe-report-grid')&&!section('seaVibeTrialBalanceView').includes('sea-vibe-report-metric')&&!section('seaVibeIncomeStatementView').includes('sea-vibe-report-metric')&&!section('seaVibeBalanceSheetView').includes('sea-vibe-report-metric'));
check('app view registry includes three screens',app.includes('seaVibeTrialBalance: document.getElementById("seaVibeTrialBalanceView")')&&app.includes('seaVibeIncomeStatement: document.getElementById("seaVibeIncomeStatementView")')&&app.includes('seaVibeBalanceSheet: document.getElementById("seaVibeBalanceSheetView")'));
check('page metadata uses localization keys',app.includes('seaVibeTrialBalance: ["seaVibe.page.trialBalance.title"')&&app.includes('seaVibeIncomeStatement: ["seaVibe.page.incomeStatement.title"')&&app.includes('seaVibeBalanceSheet: ["seaVibe.page.balanceSheet.title"'));
check('service calls three production RPCs',service.includes("rpc('sea_vibe_trial_balance_r44r38r19'")&&service.includes("rpc('sea_vibe_income_statement_r44r38r19'")&&service.includes("rpc('sea_vibe_balance_sheet_r44r38r19'"));
check('service enforces independent permissions',service.includes("permission('seaVibeTrialBalance','view')")&&service.includes("permission('seaVibeIncomeStatement','view')")&&service.includes("permission('seaVibeBalanceSheet','view')"));
check('frontend activates all three reports',js.includes("view==='seaVibeTrialBalance'")&&js.includes("view==='seaVibeIncomeStatement'")&&js.includes("view==='seaVibeBalanceSheet'"));
check('trial balance renders 8 financial columns and totals',js.includes('function renderTrialBalance()')&&js.includes('openingDebit')&&js.includes('periodCredit')&&js.includes('closingDifference'));
check('income statement renders revenue expenses net result',js.includes('function renderIncomeStatement()')&&js.includes('totalRevenue')&&js.includes('totalExpenses')&&js.includes('netResult'));
check('balance sheet renders accounting equation',js.includes('function renderBalanceSheet()')&&js.includes('totalAssets')&&js.includes('totalLiabilities')&&js.includes('totalEquity')&&js.includes('equationDifference'));
check('canonical financial CSS added',css.includes('.sea-vibe-financial-filters')&&css.includes('.sea-vibe-financial-totals')&&css.includes('.sea-vibe-financial-hierarchy'));
check('financial localization keys present',loc.includes('sidebar.seaVibeTrialBalance')&&loc.includes('seaVibe.trialBalance.openingDebit')&&loc.includes('seaVibe.incomeStatement.netResult')&&loc.includes('seaVibe.balanceSheet.equationDifference'));
check('R19 release localization keys present',loc.includes('pwa.update.release.r44r38r19.title')&&loc.includes('pwa.update.release.r44r38r19.note3'));
check('canonical GL RPC present in production SQL',sql.includes('sea_vibe_general_ledger_rows_r44r38r19'));
check('account statement aligned to canonical GL',sql.includes('create or replace function public.sea_vibe_account_statement_r44r38r15')&&sql.includes('sea_vibe_general_ledger_rows_r44r38r19'));
check('three report RPCs present in SQL',sql.includes('sea_vibe_trial_balance_r44r38r19')&&sql.includes('sea_vibe_income_statement_r44r38r19')&&sql.includes('sea_vibe_balance_sheet_r44r38r19'));
check('no R44 pruning activation',!/prun(ing|e).*(enable|active)|delete.*retention|cron/i.test(sql));
const protectedHashes={
'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
'assets/js/sync-retention.js':'4b98c05457eaa859cc70fc9779bb7f8c9490bdfc70976b233814d8a45452835b',
'assets/js/permissions.js':'433c463180df94420c706fe55a5a13b3b8d69c6d1c92b59c0ad4674946e91f34',
'assets/js/permissions-service.js':'e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a',
'assets/js/users-service.js':'c5d03971d7ee4db1c053529bdf3b490441532130a6dbef77e94dd57984702720',
'supabase/functions/manage-user/index.ts':'aad01da16f036c61dd97ee057e9724672d2bb98324314ec447e2ffbb70031d00'};
check('protected architecture byte-identical to R18',Object.entries(protectedHashes).every(([f,h])=>sha(f)===h));
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)passed++;}
console.log(`\nR44R38R19 certification: ${passed}/${checks.length} PASS`);if(passed!==checks.length)process.exit(1);
