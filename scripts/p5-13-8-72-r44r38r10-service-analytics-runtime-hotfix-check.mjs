import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const reports = read('assets/js/installation-operations-reports.js');
const loc = read('assets/js/localization-center.js');
const html = read('index.html');
const pwa = read('assets/js/pwa.js');
const sw = read('service-worker.js');
const version = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('supabase/migration-manifest.json'));
const checks=[];
const check=(name,value)=>checks.push([name,Boolean(value)]);

const fnMatch = reports.match(/function renderServiceAnalytics\(data\)\{[^\n]+/);
const fn = fnMatch?.[0] || '';

check('release version is 18.56.99', version.version==='18.56.99' && pkg.version==='18.56.99');
check('release build is 185699', version.build===185699);
check('release phase is R44R38R10', manifest?.release?.phase==='R44R38R10' && manifest?.release?.build===185699);
check('service analytics function exists', Boolean(fn));
check('canonical translation helper remains defined', reports.includes("const t=(key,fallback,vars={})=>"));
check('service analytics totals use non-conflicting local name', fn.includes('totals=analytics.totals'));
check('service analytics no longer shadows t with totals', !fn.includes(',t=analytics.totals'));
check('execution count reads totals object', fn.includes('num(totals.executions)'));
check('quantity reads totals object', fn.includes('num(totals.quantity)'));
check('revenue reads totals object', fn.includes('money(totals.value)'));
check('expenses read totals object', fn.includes('money(totals.expenses)'));
check('profit reads totals object', fn.includes('money(totals.profit)'));
check('finance margin reads totals object', fn.includes('`${totals.margin}%`'));
check('finance averages read totals object', fn.includes('money(totals.average)') && fn.includes('money(totals.averageCost)') && fn.includes('money(totals.averageProfit)'));
check('translation function still renders execution times', (fn.match(/t\('appointments\.reports\.services\.executionTimes'/g)||[]).length===2);
check('translation function still renders representative and team labels', fn.includes("t('appointments.reports.summary.allRepresentatives'") && fn.includes("t('appointments.reports.services.teamFilter.all'"));
check('no second local t declaration exists in reports owner', (reports.match(/\b(?:const|let|var)\s+t\s*=/g)||[]).length===1);
check('R10 release localization keys exist', loc.includes('pwa.update.release.r44r38r10.title') && loc.includes('pwa.update.release.r44r38r10.note3'));
check('PWA runtime version is 18.56.99', pwa.includes('const CURRENT_VERSION = "18.56.99";'));
check('service worker cache token is R44R38R10', sw.includes('petatoe-pwa-18-56-99-service-analytics-runtime-hotfix-r44r38r10-p5-13-8-72'));
check('all local asset tokens are 18.56.99', (()=>{const tokens=[...html.matchAll(/[?&]v=(\d+\.\d+\.\d+)/g)].map(x=>x[1]);return tokens.length===97 && tokens.every(x=>x==='18.56.99')})());
check('no new SQL migration was added for runtime hotfix', fs.readdirSync(path.join(root,'supabase/migrations')).filter(x=>x.endsWith('.sql')).length===273);
check('pre-existing manifest drift remains exactly three SQL files', 273-(manifest?.inventoryStats?.sqlFileCount||0)===3);
check('R44 pruning remains disabled', read('supabase/migrations/phase_p5_13_8_72_r44_bounded_pruning_engine_disabled.sql').includes('false'));

let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(ok)passed++;}
console.log(`\n${passed}/${checks.length} PASS`);
if(passed!==checks.length)process.exit(1);
