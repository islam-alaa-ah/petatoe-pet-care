import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const svc=read('assets/js/installations-service.js');
const ui=read('assets/js/installation-operations-reports.js');
const css=read('assets/css/installation-operations-reports.css');
const html=read('index.html');
const ver=JSON.parse(read('version.json'));
const checks=[
  ['duration rendered above connector', ui.includes('installation-summary-stage-duration') && !ui.includes('<small>${esc(duration)}</small>') && css.includes('installation-summary-stage-duration') && css.includes('inset-inline-start:calc(50% + 8px)')],
  ['negative/invalid elapsed time is not coerced to zero', ui.includes('if(!Number.isFinite(delta)||delta<0)return') && !ui.includes('Math.max(0,Math.round((new Date(b)-new Date(a))/60000))')],
  ['previous/today/next are anchored to real current date', ui.includes("installationSummaryPreviousDay')?.addEventListener('click',()=>{const d=new Date();d.setDate(d.getDate()-1)") && ui.includes("installationSummaryToday')?.addEventListener('click',()=>{setSummaryDate(isoDate(new Date()))") && ui.includes("installationSummaryNextDay')?.addEventListener('click',()=>{const d=new Date();d.setDate(d.getDate()+1)")],
  ['quick-day active state follows selected report date', ui.includes('const active=selected===date') && ui.includes('aria-pressed')],
  ['manual year/month/day changes reload summary', ui.includes("['installationSummaryYear','installationSummaryMonth','installationSummaryDay','installationSummaryRepresentative']") && ui.includes('fillSummaryDays();updateSummaryDayNav();loadInstallationSummary()')],
  ['representative filter is applied in service', svc.includes("!filters.representativeId||String(representativeId||'')===String(filters.representativeId)")],
  ['team empty-selection is explicit instead of falling back to all', svc.includes('teamFilterApplied=filters.teamFilterApplied===true') && svc.includes('!teamFilterApplied||selectedTeams.has') && ui.includes("'لا توجد فرق مختارة'")],
  ['single/multi-day dedupe remains global by request', svc.includes('requestsWithVisits') && svc.includes("from('installation_execution_visits').select('installation_request_id').in('installation_request_id',candidateRequestIds)") && svc.includes('singleDayRequests=scopedRequests.filter')],
  ['summary value/cost/profit share same capped allocated quantities', svc.includes('const value=quantity*unitPrice*1.15,expenses=quantity*unitCost,profit=value-expenses') && svc.includes('quantity=maxQty>0?Math.min(maxQty,Number(x.quantity||0)):Number(x.quantity||0)') && svc.includes('totalProfit=totalValue-totalExpenses')],
  ['execution grouping remains canonical by team/request/date with ordered output', svc.includes('const executionGrouped=new Map()') && svc.includes("const key=[order.requestId,order.teamId||'',order.scheduledDate||''].join('|')") && svc.includes('orders:[...canonical.values()]') && svc.includes("String(a.scheduledTime||'').localeCompare(String(b.scheduledTime||''))") && ui.includes('installation-summary-execution-team')],
  ['version/cache metadata uses current unified token', /^18\.55\.\d+$/.test(ver.version) && html.includes('?v='+ver.version)]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
console.log(`M15.10.1 checks: ${checks.length}/${checks.length} PASS`);
