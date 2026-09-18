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
const ui=read('assets/js/sea-vibe.js');
const css=read('assets/css/sea-vibe.css');
const loc=read('assets/js/localization-center.js');
const checks=[]; const check=(name,value)=>checks.push([name,Boolean(value)]);
check('release version 18.56.115',version.version==='18.56.115'&&pkg.version==='18.56.115');
check('release build 185715',version.build===185715);
check('manifest release R44R38R15R3',manifest.release?.phase==='R44R38R15R3'&&manifest.release?.version==='18.56.115'&&manifest.release?.build===185715);
check('frontend-only phase keeps migration inventory count',manifest.inventoryStats.sqlFileCount===284&&manifest.historicalInventory.length===284);
check('all index cache tokens use 18.56.115',(()=>{const xs=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(x=>x[1]);return xs.length>0&&xs.every(x=>x==='18.56.115')})());
check('PWA current version aligned',read('assets/js/pwa.js').includes('const CURRENT_VERSION = "18.56.115"'));
check('service worker cache aligned',read('service-worker.js').includes('petatoe-pwa-18-56-115-account-statement-opening-total-r44r38r15r3'));
check('opening row is generated inside canonical render',ui.includes('class="sea-vibe-account-statement-opening"')&&ui.includes("t('seaVibe.accountStatement.openingBalance','Opening Balance')"));
check('opening row always precedes movement rows',ui.includes('body.innerHTML=openingRow+movementRows'));
check('opening value displayed in running balance column',ui.includes('<strong>${esc(money(opening))}</strong>'));
check('opening accounting side follows account normal side',ui.includes("openingNormalSide=account?.normalSide==='credit'?'credit':'debit'")&&ui.includes("openingSide=opening>=0?openingNormalSide"));
check('opening row shows selected account',ui.includes('accountLocal')&&ui.includes('account.code'));
check('existing totals row remains in table footer',html.includes('class="sea-vibe-account-statement-totals"')&&html.includes('seaVibeAccountStatementFooterDebit')&&html.includes('seaVibeAccountStatementFooterCredit')&&html.includes('seaVibeAccountStatementFooterClosing'));
check('totals row has strong canonical visual treatment',css.includes('.sea-vibe-account-statement-totals td{border-top:2px solid var(--primary')&&css.includes('linear-gradient(135deg,rgba(31,111,229,.14),rgba(206,154,35,.08))'));
check('opening row visual treatment owned by SEA VIBE stylesheet',css.includes('.sea-vibe-account-statement-opening td{background:linear-gradient'));
check('dark theme coverage for opening and totals',css.includes('html[data-theme="dark"] .sea-vibe-account-statement-opening td')&&css.includes('html[data-theme="dark"] .sea-vibe-account-statement-totals td'));
check('no important override introduced',!css.includes('!important'));
check('existing opening balance localization key reused',loc.includes('["seaVibe.accountStatement.openingBalance","label","الرصيد الافتتاحي","Opening Balance"]'));
check('R15R3 release localization keys present',loc.includes('pwa.update.release.r44r38r15r3.title')&&loc.includes('pwa.update.release.r44r38r15r3.note3'));
check('statement service contract unchanged this phase',sha('assets/js/sea-vibe-service.js')==='150bf3bf1a7baa7a000ce6ea419a77e5b3bac2f5d9a549ba32cc8de4f9cc73d9');
check('app navigation contract unchanged this phase',sha('assets/js/app.js')==='7a0cb3e9287ce1d3316c40d6dccab867c5847cd3aee6bbb7672711f7ab5bb774');
check('R15R2 production SQL byte-identical',sha('supabase/migrations/phase_p5_13_8_72_r44r38r15r2_full_ledger_link_recovery.sql')==='a3ad5f5ee25671dc0addf15f18575dd8b7650785ff570f56aff79c81d37d98b6');
check('known three-file manifest drift preserved',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-manifest.inventoryStats.sqlFileCount===3);
const protectedHashes={
 'assets/js/offline-queue.js':'5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7',
 'assets/js/smart-cache.js':'b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d',
 'assets/js/sync-engine.js':'7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e',
 'assets/js/sync-retention.js':'4b98c05457eaa859cc70fc9779bb7f8c9490bdfc70976b233814d8a45452835b',
 'assets/js/permissions.js':'bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456',
 'assets/js/permissions-service.js':'e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a'
};
for(const [file,hash] of Object.entries(protectedHashes))check(`protected ${file} byte-identical`,sha(file)===hash);
let passed=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(ok)passed++;}
console.log(`\nR44R38R15R3 certification: ${passed}/${checks.length} PASS`); if(passed!==checks.length)process.exit(1);
