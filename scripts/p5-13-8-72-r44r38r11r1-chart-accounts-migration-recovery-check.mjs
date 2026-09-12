import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');
const stat=rel=>fs.statSync(path.join(root,rel));
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const manifest=JSON.parse(read('supabase/migration-manifest.json'));
const html=read('index.html');
const loc=read('assets/js/localization-center.js');
const original='supabase/migrations/phase_p5_13_8_72_r44r38r11_sea_vibe_chart_of_accounts.sql';
const recovery='supabase/migrations/phase_p5_13_8_72_r44r38r11r1_chart_of_accounts_migration_recovery.sql';
const sql=read(recovery);
const sqlCode=sql.replace(/--.*$/gm,'');
const checks=[]; const check=(name,value)=>checks.push([name,Boolean(value)]);

check('release version is 18.56.101',version.version==='18.56.101'&&pkg.version==='18.56.101');
check('release build is 185701',version.build===185701);
check('release phase is R44R38R11R1',manifest?.release?.phase==='R44R38R11R1'&&manifest?.release?.build===185701);
check('all local asset tokens are 18.56.101',(()=>{const x=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(m=>m[1]);return x.length===97&&x.every(v=>v==='18.56.101')})());
check('historical R11 migration is byte-identical','30718220d17efe1c1a372f180cffbb9eda3664b0d9db86fa3c2979747a7d6f08'===sha(original));
check('recovery is a new migration',fs.existsSync(path.join(root,recovery))&&recovery!==original);
check('recovery recreates validation trigger idempotently',sql.includes('drop trigger if exists trg_sea_vibe_chart_account_validate_r44r11')&&sql.includes('create trigger trg_sea_vibe_chart_account_validate_r44r11'));
check('recovery recreates catalog default trigger idempotently',sql.includes('drop trigger if exists trg_sea_vibe_default_expense_catalog_account_r44r11')&&sql.includes('create trigger trg_sea_vibe_default_expense_catalog_account_r44r11'));
check('recovery recreates expense snapshot trigger idempotently',sql.includes('drop trigger if exists trg_sea_vibe_snapshot_expense_account_r44r11')&&sql.includes('create trigger trg_sea_vibe_snapshot_expense_account_r44r11'));
check('recovery recreates all chart RLS policies idempotently',[
  'sea vibe chart accounts read','sea vibe chart accounts insert','sea vibe chart accounts update'
].every(x=>sql.includes(`drop policy if exists "${x}"`)&&sql.includes(`create policy "${x}"`)));
check('recovery remains transactional',/^\s*begin;/mi.test(sql)&&/\bcommit;\s*$/mi.test(sql));
check('recovery has an in-transaction verification gate',sql.includes('R44R38R11R1_VERIFY_TRIGGERS_')&&sql.includes('R44R38R11R1_VERIFY_POLICIES_')&&sql.includes('R44R38R11R1_VERIFY_ROOTS_'));
check('recovery preserves five canonical account roots',['الأصول','الالتزامات','حقوق الملكية','الإيرادات','المصروفات'].every(x=>sql.includes(`'${x}'`)));
check('recovery preserves partner current and drawings',sql.includes("('32','جاري الشريك','Partner Current Account'")&&sql.includes("('33','مسحوبات الشريك','Partner Drawings'"));
check('recovery preserves expense account mapping logic',['5101','5102','5103','5104','510501','510599','5106','5299'].every(x=>sql.includes(`'${x}'`)));
check('recovery does not delete operational data',!/^\s*delete\s+from\b/gmi.test(sqlCode)&&!/\btruncate\b/i.test(sqlCode)&&!/\bdrop\s+(table|column|schema|function|view)\b/i.test(sqlCode));
check('recovery does not widen screen permissions',!sql.includes('insert into public.app_screens')&&!sql.includes('app_role_permissions'));
check('recovery keeps R44 pruning untouched',read('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql').includes('false'));
check('R11R1 update localization keys exist',loc.includes('pwa.update.release.r44r38r11r1.title')&&loc.includes('pwa.update.release.r44r38r11r1.note3'));
check('recovery migration is inventoried with matching fingerprint',(()=>{const e=manifest.historicalInventory.find(x=>x.path===recovery);return e&&e.sha256===sha(recovery)&&e.bytes===stat(recovery).size})());
check('new migration preserves the pre-existing three-file manifest drift',fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length-(manifest?.inventoryStats?.sqlFileCount||0)===3);
check('SEA VIBE UI remains byte-identical to R11','1933309acdbb9f436db13927385f5fe2078a41267957d8908a6500e32842daec'===sha('assets/js/sea-vibe.js'));
check('SEA VIBE service remains byte-identical to R11','cb427b67d1bb170cc038c3189340da81f75215b7caed22d680ac0619e865e746'===sha('assets/js/sea-vibe-service.js'));
check('SEA VIBE CSS remains byte-identical to R11','38ee42ef0ba1ee42fa6a8cf917f1200ccb1d6f2c9d625c7ce36f388a267098b9'===sha('assets/css/sea-vibe.css'));
check('offline queue remains byte-identical to R11','5d67b6107d46feef61710d61eef7a8d9bd73aa4cd531cabd6a43a9c6a80401c7'===sha('assets/js/offline-queue.js'));
check('smart cache remains byte-identical to R11','b44d40476304ca595ea6902d3baa3fbbc76fe75a0cfe31fd1906ec9b931d6b0d'===sha('assets/js/smart-cache.js'));
check('sync engine remains byte-identical to R11','7d8b7feb1f87981e100b05b552b9b401dd0d8d0a27937e9c7ea2f9f39c0ee53e'===sha('assets/js/sync-engine.js'));
check('permission owners remain byte-identical to R11','bbe1ba1f88d411aa8047188638ab0c914215101a3f79121416d9b0ee685e5456'===sha('assets/js/permissions.js')&&'e214a971a0740da9cae7b82ed2956a7998ea0095e9575e59def664b47926372a'===sha('assets/js/permissions-service.js'));

let passed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(ok)passed++;}
console.log(`\n${passed}/${checks.length} PASS`);if(passed!==checks.length)process.exit(1);
