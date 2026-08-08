import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const checks=[
 ['request price detail',read('assets/js/installations-module.js').includes('installation-service-detail')],
 ['view action',read('assets/js/installations-module.js').includes('data-install-view')],
 ['inline edit action',read('assets/js/installations-module.js').includes('data-install-services-edit')],
 ['service updater',read('assets/js/installations-service.js').includes('updateRequestServices')],
 ['schedule view action',read('assets/js/installation-scheduling.js').includes('data-view-request')],
 ['schedule edit action',read('assets/js/installation-scheduling.js').includes('data-edit-request-services')],
 ['assignment service summary',read('index.html').includes('installationAssignmentServicesSummary')],
 ['version',JSON.parse(read('version.json')).version==='18.49.3']
];
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)process.exitCode=1;}
