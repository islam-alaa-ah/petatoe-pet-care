import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('assets/css/petatoe-navigation-shell.css');
const html = read('index.html');
const sw = read('service-worker.js');
const version = JSON.parse(read('version.json'));
const checks = [
  ['version 18.54.46', version.version === '18.54.46'],
  ['navigation stylesheet cache token bumped', html.includes('petatoe-navigation-shell.css?v=18.54.46')],
  ['header menu button locked to 48px', css.includes('width:48px!important;') && css.includes('.petatoe-menu-icon{width:22px!important')],
  ['header action controls locked to 48px', css.includes('flex:0 0 48px!important;') && css.includes('notification-bell-btn > svg')],
  ['header avatar locked to 34px', css.includes('width:34px!important;') && css.includes('flex:0 0 34px!important;')],
  ['sidebar group icons locked to 20px', css.includes('.nav-group-icon{width:20px!important;height:20px!important')],
  ['sidebar logout svg has hard max size', css.includes('.mobile-sidebar-logout > svg') && css.includes('max-width:18px!important;') && css.includes('max-height:18px!important;')],
  ['sidebar logout uses compact horizontal flex', css.includes('justify-content:center!important;') && css.includes('height:42px!important;')],
  ['mobile sidebar width capped', css.includes('width:min(90vw,330px)!important;') && css.includes('width:min(92vw,330px)!important')],
  ['service worker cache bumped', sw.includes('18-54-46-p51171-navigation-sizing-alignment-recovery')],
  ['existing navigation keys preserved', html.includes('data-view="dailyOperations"') && html.includes('data-view="installationSchedule"') && html.includes('data-view="permissions"')],
  ['mobile bottom navigation still exists', html.includes('class="mobile-bottom-nav"') && html.includes('data-mobile-action="menu"')]
];
let failed=0;
for (const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'} — ${name}`); if(!ok) failed++; }
if(failed) process.exit(1);
console.log(`Navigation sizing/alignment certification: ${checks.length}/${checks.length} PASS`);
