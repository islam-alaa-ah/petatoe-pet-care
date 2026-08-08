import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const app=read('assets/js/app.js');
const ui=read('assets/js/notification-center.js');
const css=read('assets/css/notification-center.css');
const html=read('index.html');
const ver=JSON.parse(read('version.json'));
const checks=[
 ['view registered',/notificationCenter:\s*document\.getElementById\("notificationCenterView"\)/.test(app)],
 ['page meta registered',/notificationCenter:\s*\["مركز الإشعارات"/.test(app)],
 ['notification view exists',/id="notificationCenterView"/.test(html)],
 ['mobile touch fallback',/addEventListener\('touchend'/.test(ui)],
 ['bell aria state',/aria-expanded/.test(ui)],
 ['mobile actions lane widened',/grid-template-columns:96px minmax\(0,1fr\) 96px/.test(css)],
 ['bell no longer absolute on mobile',/#appHeader \.notification-bell-wrap\{[\s\S]*position:relative!important/.test(css)],
 ['bell and theme separated by gap',/gap:10px!important/.test(css)],
 ['version 18.53.23',ver.version==='18.53.23' && html.includes('v=18.53.23')],
];
let fail=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) fail++;}
if(fail) process.exit(1);
console.log(`PASS ${checks.length}/${checks.length}`);
