import fs from 'node:fs';
const css=fs.readFileSync('assets/css/notification-center.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const ver=JSON.parse(fs.readFileSync('version.json','utf8'));
const checks=[
 ['bell remains single header control', (html.match(/id="notificationBellBtn"/g)||[]).length===1],
 ['desktop emphasis gradient exists', css.includes('linear-gradient(145deg,#2563eb 0%,#0ea5e9 100%)')],
 ['desktop hover elevation exists', css.includes('transform:translateY(-2px)')],
 ['mobile bell is absolutely isolated', css.includes('#appHeader .notification-bell-wrap')&&css.includes('position:absolute!important')],
 ['mobile bell placed away from menu', css.includes('right:calc(max(12px,env(safe-area-inset-right)) + 52px)!important')],
 ['mobile dropdown uses fixed viewport placement', css.includes('#appHeader .notification-dropdown')&&css.includes('position:fixed!important')],
 ['unread badge strengthened', css.includes('min-width:20px')&&css.includes('border:2px solid #fff')],
 ['version bumped', ver.version==='18.53.22'&&ver.build===185322]
];
let failed=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} — ${n}`); if(!ok)failed++;}
if(failed) process.exit(1);
