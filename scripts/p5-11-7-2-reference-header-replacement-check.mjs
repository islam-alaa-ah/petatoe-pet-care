import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/css/petatoe-navigation-shell.css','utf8');
const pwa=fs.readFileSync('assets/js/pwa.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8'));
const checks=[
  ['version is 18.54.47',version.version==='18.54.47'&&pwa.includes('18.54.47')],
  ['header uses one clean brand area',html.includes('class="topbar-brand topbar-logo-banner"')&&css.includes('Brand is intentionally unboxed')],
  ['brand card styling removed',css.includes('#appHeader .topbar-brand{')&&css.includes('border:0!important')&&css.includes('background:none!important')],
  ['reference logo size contract',css.includes('width:92px!important')&&css.includes('height:92px!important')],
  ['reference menu size contract',css.includes('width:64px!important')&&css.includes('height:64px!important')],
  ['gold side ornaments exist',css.includes('gold side ornaments')&&css.includes('rgba(255,220,123,.98)')],
  ['blue lower arc and center flare exist',css.includes('electric-blue lower arc')&&css.includes('.topbar-watermark::before')&&css.includes('.topbar-watermark::after')],
  ['user identity has role line',html.includes('id="currentUserRoleLabel"')&&html.includes('petatoe-header-user-role')],
  ['legacy scroll logo removed from visual header',css.includes('#appHeader .kyum-scroll-control{display:none!important}')],
  ['mobile header remains responsive',css.includes('@media (max-width:767px)')&&css.includes('grid-template-areas:"menu title actions"')]
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(ok)pass++;}
console.log(`\n${pass}/${checks.length} PASS`);
if(pass!==checks.length) process.exit(1);
