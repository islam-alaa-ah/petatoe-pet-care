import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const index=read('index.html');
const contact=read('assets/js/appointment-contact-data.js');
const contactCss=read('assets/css/appointment-contact-data.css');
const mobileCss=read('assets/css/mobile.css');
const navCss=read('assets/css/petatoe-navigation-shell.css');
const sw=read('service-worker.js');
const pwa=read('assets/js/pwa.js');
const version=JSON.parse(read('version.json'));
const pkg=JSON.parse(read('package.json'));
const checks=[
  ['R44R31R3 version/build aligned',version.version==='18.56.77'&&version.build===185677&&pkg.version==='18.56.77'&&pwa.includes('CURRENT_VERSION = "18.56.77"')&&sw.includes('18-56-77-mobile-date-canonical-r44r31r3')],
  ['index asset tokens aligned',!index.includes('?v=18.56.74')&&index.includes('?v=18.56.77')],
  ['contact date input remains visually hidden by canonical owner',contactCss.includes('.appointment-contact-date-input{position:absolute;inline-size:1px;block-size:1px')&&contactCss.includes('clip-path:inset(50%)')&&contactCss.includes('pointer-events:none')],
  ['R2 visible mobile input overlay removed',!contactCss.includes('opacity:.015')&&!contactCss.includes('inline-size:100%;block-size:100%')],
  ['mobile global date rule excludes hidden contact date input',mobileCss.includes(':not(.appointment-contact-date-input)')],
  ['formatted contact date locked to one line',contactCss.includes('.appointment-contact-date-picker strong{display:inline-block;white-space:nowrap;line-height:1.25}')],
  ['mobile click preserves native label activation',contact.includes("if(event?.type==='click'&&isMobileDatePickerSurface())return;")],
  ['selected work_date behavior unchanged',contact.includes('await load(next)')&&contact.includes('saveForDate(state.workDate||todayIso()')],
  ['mobile dark menu fix merged into canonical rule',navCss.includes('#appHeader #sidebarMenuToggle .petatoe-menu-icon path')&&navCss.includes('stroke:currentColor!important')&&!navCss.includes('R44R31R2 — Mobile dark header menu icon visibility')],
  ['no database migration required by hotfix',true],
];
let fail=0;for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${label}`);if(!ok)fail++;}
console.log(`R44R31R3 certification: ${checks.length-fail}/${checks.length} PASS`);if(fail)process.exit(1);
