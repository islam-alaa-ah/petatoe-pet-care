import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const checks=[
 ['multi-day toggle',read('index.html').includes('installationMultiDayToggle')],
 ['visits allocation panel',read('index.html').includes('installationMultiDayVisits')],
 ['client validation',read('assets/js/installation-scheduling.js').includes('validateMultiDay')],
 ['service rpc',read('assets/js/installations-service.js').includes('schedule_installation_request_multi_day')],
 ['calendar visit expansion',read('assets/js/installations-service.js').includes('installation_execution_visits')],
 ['database function',read('supabase/migrations/phase_m14_9_8_15_3_multi_day_scheduling_workflow_recovery.sql').includes('schedule_installation_request_multi_day')],
 ['version',read('version.json').includes('18.50.4')]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)failed++;}process.exitCode=failed?1:0;
