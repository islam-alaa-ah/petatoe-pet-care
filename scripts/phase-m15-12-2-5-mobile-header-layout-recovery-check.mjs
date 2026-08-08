import fs from 'node:fs';
const css=fs.readFileSync(new URL('../assets/css/notification-center.css',import.meta.url),'utf8');
const checks=[
 ['phase marker',css.includes('Phase M15.12.2.5 — Mobile Header Layout Recovery')],
 ['mobile block restores display block',/#appHeader\.topbar,[\s\S]*?display:block!important/.test(css)],
 ['user actions restored to contents',/#appHeader \.topbar-user-actions\{[\s\S]*?display:contents!important/.test(css)],
 ['bell is absolute mobile lane',/#appHeader \.notification-bell-wrap\{[\s\S]*?position:absolute!important/.test(css)],
 ['bell is separated from theme',/right:calc\(max\(14px,env\(safe-area-inset-right\)\) \+ 60px\)!important/.test(css)],
 ['theme stays far right',/#appHeader #themeToggleButton,[\s\S]*?right:max\(14px,env\(safe-area-inset-right\)\)!important/.test(css)],
 ['48px touch target',/#appHeader \.notification-bell-btn\{[\s\S]*?width:48px!important[\s\S]*?height:48px!important/.test(css)],
 ['dropdown viewport safe',/position:fixed!important[\s\S]*?max-height:calc\(100dvh/.test(css)],
 ['compact phone rule',/@media \(max-width:360px\)/.test(css)]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++;}
console.log(`${checks.length-failed}/${checks.length} PASS`);
if(failed) process.exit(1);
