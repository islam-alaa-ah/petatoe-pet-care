import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const html=read('index.html');
const js=read('assets/js/installation-operations-reports.js');
const service=read('assets/js/installations-service.js');
const css=read('assets/css/installation-operations-reports.css');
const checks=[
  ['tab after summary', html.indexOf('data-installation-report-tab="services"')>html.indexOf('data-installation-report-tab="summary"') && html.indexOf('data-installation-report-tab="services"')<html.indexOf('data-installation-report-tab="financial"')],
  ['services panel exists', html.includes('data-installation-report-panel="services"') && html.includes('تحليل الخدمات')],
  ['service KPI dashboard', ['installationServiceKpiDistinct','installationServiceKpiExecutions','installationServiceKpiQuantity','installationServiceKpiRevenue','installationServiceKpiExpenses','installationServiceKpiProfit','installationServiceKpiTopProfit','installationServiceKpiTopExecution'].every(x=>html.includes(x))],
  ['summary services table', html.includes('installationServiceAnalyticsBody') && html.includes('هامش الربح') && html.includes('متوسط قيمة الوحدة')],
  ['three ranking panels', ['installationServiceTopProfitList','installationServiceTopRevenueList','installationServiceTopExecutionList'].every(x=>html.includes(x))],
  ['independent date navigation', ['serviceDate()','updateServiceDayNav','installationServicePreviousDay','installationServiceToday','installationServiceNextDay'].every(x=>js.includes(x))],
  ['representative and team filters', js.includes('installationServiceRepresentative') && js.includes('installationServiceTeamsOptions') && js.includes('teamFilterApplied:explicitTeamFilter')],
  ['empty team selection honored', js.includes("state.serviceSelectedTeams.size!==allTeamIds.size") && js.includes("state.serviceSelectedTeams=action==='all'?")],
  ['unique execution tracking', service.includes('entryKeys:new Set()') && service.includes('item.entryKeys.add(entryKey)') && service.includes('executions:x.entryKeys.size')],
  ['single/multi day source preserved', service.includes('installation_execution_visit_services') && service.includes('singleDayRequests') && service.includes('requestsWithVisits')],
  ['responsive analytics styles', css.includes('Phase S1 — Service Analytics Dashboard') && css.includes('.installation-service-analytics-layout') && css.includes('@media(max-width:760px)')],
  ['version 18.53.12', read('version.json').includes('18.53.12') && read('assets/js/pwa.js').includes('18.53.12') && read('service-worker.js').includes('18-53-12-service-analytics-s1')]
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} — ${name}`);if(ok)pass++;}
console.log(`\nS1 Service Analytics Dashboard: ${pass}/${checks.length} PASS`);
if(pass!==checks.length)process.exit(1);
