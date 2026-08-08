import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('assets/css/installation-operations-reports.css');
const version=JSON.parse(read('version.json'));
const checks=[
 ['timeline reserves vertical duration band',/\.installation-summary-stage\{[^}]*padding:18px 5px 0/.test(css)],
 ['connector moved below duration band',/\.installation-summary-stage:not\(:last-child\)::after\{[^}]*top:27px/.test(css)],
 ['duration stays inside stage instead of negative top',/\.installation-summary-stage-duration\{[^}]*top:1px/.test(css)],
 ['duration is vertically centered',/\.installation-summary-stage-duration\{[^}]*display:flex[^}]*align-items:center[^}]*justify-content:center/.test(css)],
 ['duration has surface background for readability',/\.installation-summary-stage-duration\{[^}]*background:var\(--surface-color\)/.test(css)],
 ['phase version bumped',version.version==='18.53.11'],
 ['cache token bumped',version.cacheToken==='kyum-crm-pwa-18-53-11-installation-summary-timeline-spacing']
];
let fail=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)fail++;}
console.log(`M15.10.2: ${checks.length-fail}/${checks.length} PASS`);
process.exit(fail?1:0);
