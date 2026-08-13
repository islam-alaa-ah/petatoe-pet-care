import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/css/petatoe-navigation-shell.css','utf8');
const ver=JSON.parse(fs.readFileSync('version.json','utf8'));
const checks=[
  ['version 18.54.48', ver.version==='18.54.48'],
  ['no search control introduced', !/headerSearch|search-btn|petatoe-header-search/i.test(html)],
  ['real bottom arc exists', html.includes('petatoe-header-reference-arc') && css.includes('#appHeader .petatoe-header-reference-arc')],
  ['gold side rails exist', html.includes('petatoe-header-gold-rail--left') && html.includes('petatoe-header-gold-rail--right')],
  ['legacy pseudo header layers disabled', css.includes('#appHeader.topbar::before,') && css.includes('content:none!important')],
  ['brand is unboxed', css.includes('#appHeader .topbar-brand{') && css.includes('background:none!important')],
  ['compact menu contract', css.includes('width:52px!important') && css.includes('height:52px!important')],
  ['compact user card contract', css.includes('width:232px!important') && css.includes('height:60px!important')],
  ['scroll logo removed from header', css.includes('#appHeader .kyum-scroll-control{display:none!important}')],
  ['mobile responsive contract retained', css.includes('@media (max-width:767px)') && css.includes('grid-template-areas:"menu title actions"!important')],
];
let failed=0;
for(const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++; }
console.log(`\n${checks.length-failed}/${checks.length} PASS`);
process.exit(failed?1:0);
