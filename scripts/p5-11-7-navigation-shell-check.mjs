import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('assets/css/petatoe-navigation-shell.css');
const app = read('assets/js/app.js');
const mobile = read('assets/js/mobile.js');
const sw = read('service-worker.js');
const version = JSON.parse(read('version.json'));
const checks = [
  ['version 18.54.45', version.version === '18.54.45'],
  ['navigation CSS linked last', html.includes('assets/css/petatoe-navigation-shell.css?v=18.54.45')],
  ['premium header brand copy exists', html.includes('petatoe-header-brand-copy') && html.includes('Enterprise CRM')],
  ['sidebar premium brand lockup exists', html.includes('petatoe-sidebar-brand-lockup')],
  ['sidebar close action exists', html.includes('id="sidebarCloseBtn"') && app.includes('sidebarCloseBtn')],
  ['navigation group icons preserve existing groups', (html.match(/class="nav-group-icon"/g)||[]).length === 5],
  ['active nav gold rail contract', css.includes('.nav-item.active::after') && css.includes('--pet-nav-gold')],
  ['light mode retains branded dark sidebar', css.includes('html[data-theme="light"] #mainSidebar.sidebar')],
  ['mobile header PETATOE label', mobile.includes('<strong>PETATOE</strong><small>Enterprise CRM</small>')],
  ['new shell cached offline', sw.includes('./assets/css/petatoe-navigation-shell.css') && sw.includes('18-54-45-p5117')],
  ['existing data-view navigation preserved', html.includes('data-view="customers"') && html.includes('data-view="installationSchedule"') && html.includes('data-view="permissions"')],
  ['mobile bottom navigation untouched by shell CSS', !css.includes('.mobile-bottom-nav') && !css.includes('.mobile-nav-item')]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} — ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
console.log(`Navigation shell certification: ${checks.length}/${checks.length} PASS`);
