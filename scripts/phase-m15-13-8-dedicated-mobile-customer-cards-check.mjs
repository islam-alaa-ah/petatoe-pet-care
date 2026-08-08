import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const app = read('assets/js/app.js');
const css = read('assets/css/mobile.css');
const version = JSON.parse(read('version.json'));
const checks = [
  ['mobile container exists', html.includes('id="customersMobileCards"')],
  ['desktop table marked', html.includes('customers-desktop-table')],
  ['mobile renderer targets container', app.includes('document.getElementById("customersMobileCards")')],
  ['dedicated customer mobile card markup', app.includes('customer-mobile-card') && app.includes('customer-mobile-details')],
  ['desktop table hidden only in mobile media', css.includes('#customersView .customers-desktop-table{display:none!important}')],
  ['mobile cards displayed in mobile media', css.includes('#customersView .customers-mobile-cards{') && css.includes('display:grid!important')],
  ['two-column detail layout', css.includes('grid-template-columns:repeat(2,minmax(0,1fr))')],
  ['version', version.version === '18.53.35'],
];
let failed=0;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} - ${name}`); if(!ok) failed++; }
if (failed) process.exit(1);
console.log(`PASS ${checks.length}/${checks.length}`);
