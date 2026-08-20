import fs from 'node:fs';
const scheduling=fs.readFileSync('assets/js/installation-scheduling.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8'));
const checks=[
 ['direct view function exists',/async function openRequestViewDirect\(requestId\)/.test(scheduling)],
 ['direct detail service load',/InstallationsServiceSafe\.requestEditDetail\(requestId\)/.test(scheduling)],
 ['dialog content filled directly',/installationRequestViewContent/.test(scheduling)],
 ['dialog opened directly',/if\(!dialog\.open\)dialog\.showModal\(\)/.test(scheduling)],
 ['view click uses direct path',/await openRequestViewDirect\(view\.dataset\.viewRequest\)/.test(scheduling)],
 ['view click stops propagation',/view\)\{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\)/.test(scheduling)],
 ['view dialog present in DOM',/id="installationRequestViewDialog"/.test(index)],
 ['version metadata is current and non-legacy',/^18\.55\.\d+$/.test(version.version)]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
console.log(`PASS ${checks.length}/${checks.length}`);
