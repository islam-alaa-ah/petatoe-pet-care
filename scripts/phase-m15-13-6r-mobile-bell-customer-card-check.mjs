import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('assets/js/notification-center.js');
const mobile=read('assets/css/mobile.css');
const bellCss=read('assets/css/notification-center.css');
const index=read('index.html');
const sw=read('service-worker.js');
const checks=[
  ['capture touch handler',js.includes("document.addEventListener('touchend',handleMobileBell,{capture:true,passive:false})")],
  ['capture pointer handler',js.includes("document.addEventListener('pointerup'")&&js.includes('handleMobileBell(e)')],
  ['bell target guard',js.includes("closest?.('#notificationBellBtn')")],
  ['customer two-column grid',mobile.includes('Phase M15.13.6R — Mobile Bell & Customer Card Verified Recovery')&&mobile.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important')],
  ['customer primary full width',mobile.includes('td[data-mobile-field="name"],')&&mobile.includes('td[data-mobile-field="phone"],')],
  ['mobile bell touch surface',bellCss.includes('#appHeader #notificationBellBtn{pointer-events:auto!important;z-index:91!important')],
  ['mobile dropdown high z-index',bellCss.includes('z-index:2147483000!important')],
  ['cache version html',index.includes('v=18.53.32')],
  ['cache version service worker',sw.includes('18-53-32-mobile-bell-customer-card-verified-recovery-m15-13-6r')],
];
let fail=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) fail++;}
if(fail) process.exit(1);
console.log(`${checks.length}/${checks.length} PASS`);
