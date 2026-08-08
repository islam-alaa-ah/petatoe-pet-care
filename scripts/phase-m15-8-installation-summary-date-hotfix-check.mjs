import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const service=read('assets/js/installations-service.js');
const reports=read('assets/js/installation-operations-reports.js');
const html=read('index.html');
const sw=read('service-worker.js');
const pwa=read('assets/js/pwa.js');
const pkg=JSON.parse(read('package.json'));
const version=JSON.parse(read('version.json'));
let pass=0,fail=0;
function test(name,ok){if(ok){pass++;console.log(`PASS ${name}`)}else{fail++;console.error(`FAIL ${name}`)}}

test('summary still reads multi-day execution visits',service.includes("from('installation_execution_visits').select('id,installation_request_id,scheduled_date"));
test('summary now reads single-day scheduled installation requests',service.includes("from('installation_requests').select('id,scheduled_date,installation_team_id,representative_id"));
test('selected date is applied to both schedule sources',service.includes("visitsQuery=visitsQuery.eq('scheduled_date',filters.date);requestsQuery=requestsQuery.eq('scheduled_date',filters.date)"));
test('multi-day requests are explicitly excluded from single-day fallback',service.includes('requestsWithVisits=new Set')&&service.includes(".in('installation_request_id',candidateRequestIds)")&&service.includes('singleDayRequests=scopedRequests.filter'));
test('single-day service quantities feed the same summary aggregation',service.includes("'request:'+request.id")&&service.includes("servicesByRequest.get(String(request.id||''))")&&service.includes('Number(service.quantity||0)'));
test('summary visit KPI counts visit rows plus single-day schedule rows',service.includes('visits:scopedVisits.length+singleDayRequests.length'));
test('previous/today/next navigation reloads the summary',reports.includes("d.setDate(d.getDate()-1);setSummaryDate(isoDate(d));loadInstallationSummary()")&&reports.includes("d.setDate(d.getDate()+1);setSummaryDate(isoDate(d));loadInstallationSummary()")&&reports.includes("setSummaryDate(isoDate(new Date()));loadInstallationSummary()"));
test('manual year/month/day changes still reload summary',reports.includes("['installationSummaryYear','installationSummaryMonth','installationSummaryDay','installationSummaryRepresentative'].forEach"));
test('release/cache version unified',pkg.version==='18.53.7'&&version.version==='18.53.7'&&version.build===185307&&version.cacheToken==='kyum-crm-pwa-18-53-7-installation-summary-date-hotfix'&&pwa.includes('CURRENT_VERSION = "18.53.7"')&&sw.includes('kyum-crm-pwa-18-53-7-installation-summary-date-hotfix')&&html.includes('installations-service.js?v=18.53.7'));
console.log(`\nInstallation summary date hotfix: ${pass} passed, ${fail} failed`);
if(fail)process.exit(1);
