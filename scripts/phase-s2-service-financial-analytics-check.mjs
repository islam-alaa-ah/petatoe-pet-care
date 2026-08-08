import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('assets/js/installation-operations-reports.js');
const html=read('index.html');
const css=read('assets/css/installation-operations-reports.css');
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const checks=[
  ['S2 financial section exists',html.includes('id="installationServiceFinancialTitle"')&&html.includes('التحليل المالي للخدمات')],
  ['financial KPI cards exist',['installationServiceFinanceMargin','installationServiceFinanceAveragePrice','installationServiceFinanceAverageCost','installationServiceFinanceAverageProfit'].every(id=>html.includes(`id="${id}"`))],
  ['financial table has 9 columns',html.includes('id="installationServiceFinancialBody"')&&html.includes('نسبة التكلفة')&&html.includes('متوسط ربح الوحدة')],
  ['financial rankings exist',['installationServiceTopMarginList','installationServiceTopExpenseList','installationServiceLowMarginList'].every(id=>html.includes(`id="${id}"`))],
  ['service analytics derives cost and profit unit metrics',js.includes('averageCost=x.quantity?x.expenses/x.quantity:0')&&js.includes('averageProfit=x.quantity?x.profit/x.quantity:0')&&js.includes('costRate=x.value?')],
  ['totals derive weighted unit averages',js.includes('totals.averageCost=totals.quantity?totals.expenses/totals.quantity:0')&&js.includes('totals.averageProfit=totals.quantity?totals.profit/totals.quantity:0')],
  ['overall margin uses aggregate totals',js.includes('totals.margin=totals.value?Math.round((totals.profit/totals.value)*1000)/10:0')],
  ['same filtered summary source remains in use',js.includes('InstallationsServiceSafe.installationSummaryReport({date:serviceDate()')],
  ['financial render binds all values',js.includes("$('installationServiceFinanceMargin').textContent")&&js.includes("$('installationServiceFinancialBody')")],
  ['responsive financial CSS exists',css.includes('Phase S2 — Service Financial Analytics')&&css.includes('.installation-service-financial-kpis')&&css.includes('.installation-service-financial-table')],
  ['version is 18.53.13',version.version==='18.53.13'&&version.build===185313&&pkg.version==='18.53.13'],
  ['cache token bumped',version.cacheToken==='kyum-crm-pwa-18-53-13-service-financial-s2'&&read('service-worker.js').includes(version.cacheToken)&&read('assets/js/pwa.js').includes('18.53.13')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++}
console.log(`\nPhase S2 Service Financial Analytics: ${checks.length-failed}/${checks.length} PASS`);
if(failed)process.exit(1);
