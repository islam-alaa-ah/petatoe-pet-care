import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const report=read('assets/js/installation-operations-reports.js');
const service=read('assets/js/installations-service.js');
const html=read('index.html');
const css=read('assets/css/installation-operations-reports.css');
const checks=[
 ['previous uses real today',/installationSummaryPreviousDay[\s\S]*?const d=new Date\(\);d\.setDate\(d\.getDate\(\)-1\)/.test(report)],
 ['next uses real today',/installationSummaryNextDay[\s\S]*?const d=new Date\(\);d\.setDate\(d\.getDate\(\)\+1\)/.test(report)],
 ['active state compares selected to fixed today previous next',report.includes('function updateSummaryDayNav()')&&report.includes("btn.classList.toggle('primary-btn',active)")&&report.includes("aria-pressed")],
 ['manual date refreshes active state',report.includes("updateSummaryDayNav();loadInstallationSummary()")],
 ['summary service loads canonical default cost',service.includes('default_price,default_cost')],
 ['summary computes scheduled installation expenses',service.includes('const value=quantity*unitPrice,expenses=quantity*unitCost,profit=value-expenses')],
 ['summary returns expenses and net profit',service.includes('expenses:totalExpenses,profit:totalProfit')],
 ['summary UI exposes expense and profit KPI/table',html.includes('installationSummaryKpiExpenses')&&html.includes('installationSummaryKpiProfit')&&html.includes('<th>مصاريف التركيب</th><th>صافي الربح</th>')],
 ['summary empty/table layout updated for seven columns',report.includes('body.innerHTML=empty(7)')&&css.includes('min-width:1080px')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
console.log(`\n${checks.length-failed}/${checks.length} PASS`);if(failed)process.exit(1);
