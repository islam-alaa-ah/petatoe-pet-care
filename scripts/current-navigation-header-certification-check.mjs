import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html');
const css=read('assets/css/petatoe-navigation-shell.css');
const ver=JSON.parse(read('version.json'));
const sw=read('service-worker.js');
const checks=[
 ['release token is current and navigation asset matches',html.includes(`petatoe-navigation-shell.css?v=${ver.version}`)&&sw.includes(ver.cacheToken)],
 ['approved header brand exists',html.includes('class="topbar-brand topbar-logo-banner"')&&html.includes('petatoe-header-brand-icon')&&css.includes('#appHeader .topbar-brand')],
 ['approved gold rails exist',html.includes('petatoe-header-gold-rail--left')&&html.includes('petatoe-header-gold-rail--right')&&css.includes('#appHeader .petatoe-header-gold-rail')],
 ['approved blue reference arc exists',html.includes('petatoe-header-reference-arc')&&css.includes('#appHeader .petatoe-header-reference-arc')],
 ['menu and user identity contract exists',html.includes('id="sidebarMenuToggle"')&&html.includes('petatoe-menu-icon')&&html.includes('id="currentUserRoleLabel"')&&html.includes('petatoe-header-user-role')],
 ['no search control was reintroduced',!/headerSearch|petatoe-header-search/i.test(html)],
 ['mobile responsive header contract exists',css.includes('@media (max-width:767px)')&&css.includes('petatoe-header-reference-arc')&&css.includes('petatoe-header-gold-rail')],
 ['sidebar logout remains compact and bounded',css.includes('#mainSidebar .mobile-sidebar-logout')&&css.includes('#mainSidebar .mobile-sidebar-logout > svg')],
 ['mobile bottom navigation remains present',html.includes('id="mobileBottomNav"')&&html.includes('class="mobile-bottom-nav"')],
 ['legacy scroll header control stays visually removed',css.includes('#appHeader .kyum-scroll-control{display:none!important}')]
];
let failed=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${n}`);if(!ok)failed++;}
console.log(`Current navigation/header certification: ${checks.length-failed}/${checks.length} PASS`);if(failed)process.exit(1);
