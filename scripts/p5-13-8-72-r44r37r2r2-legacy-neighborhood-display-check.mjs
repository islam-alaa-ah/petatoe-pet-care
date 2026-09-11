import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(p, 'utf8');
const app = read('assets/js/app.js');
const geo = read('assets/js/geographic-address.js');
const export360 = read('assets/js/customer360-export.js');
const pwa = read('assets/js/pwa.js');
const sw = read('service-worker.js');
const html = read('index.html');
const ver = JSON.parse(read('version.json'));
const pkg = JSON.parse(read('package.json'));
const manifest = JSON.parse(read('supabase/migration-manifest.json'));

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

check('R44R37R2R2 version/build aligned', ver.version === '18.56.87' && ver.build === 185687 && pkg.version === '18.56.87');
check('PWA/cache token aligned', pwa.includes('const CURRENT_VERSION = "18.56.87";') && sw.includes('petatoe-pwa-18-56-87-legacy-neighborhood-display-r44r37r2r2-p5-13-8-72'));
check('HTML asset tokens aligned', html.includes('assets/js/app.js?v=18.56.87') && html.includes('assets/js/geographic-address.js?v=18.56.87') && html.includes('assets/js/customer360-export.js?v=18.56.87'));
check('Manifest release aligned without new migration requirement', manifest.release?.version === '18.56.87' && manifest.release?.build === 185687);
check('Canonical geography owner exposes localized district resolver', geo.includes('function localizedDistrictLabel(id = "", fallbackName = "")') && geo.includes('localizedDistrictLabel,'));
check('Resolver can match legacy address by name', geo.includes('normalizedFallback ? findByName("district", normalizedFallback) : null'));
check('Resolver falls through to entity translation when English source metadata is missing', geo.includes('window.PetatoeLocalization?.entityText?.("neighborhood"'));
check('Customer address helper delegates to canonical geography owner', app.includes('window.KYUMGeography?.localizedDistrictLabel?.(id,name)'));
check('Desktop/mobile customer list no longer bypasses localization when neighborhoodId is empty', !app.includes('c.neighborhoodId?customerNeighborhoodLabel(c.neighborhoodId,c.address):(c.address||"—")'));
check('Reference customer list uses localized neighborhood display', app.includes('${escapeHtml(customerNeighborhoodLabel(c.neighborhoodId,c.address)||"—")}'));
check('Customer 360 profile uses localized neighborhood display', app.includes('[l1T("customers.col.address"), customerNeighborhoodLabel(customer.neighborhoodId,customer.address) || "—"]'));
check('Daily customers uses localized neighborhood display', app.includes('<td>${escapeHtml(customerNeighborhoodLabel(row.neighborhoodId,row.address)||"—")}</td>'));
check('Localization remote refresh rerenders customer surfaces', app.includes('window.addEventListener("petatoe-localization-updated"') && app.includes('if (customersLoaded) {\n    renderCustomers();'));
check('Geography background refresh synchronizes customer catalogs', app.includes('window.addEventListener("kyum-geography-cache-updated"') && app.includes('customerDistrictCatalog = Array.isArray(geo.districts) ? geo.districts : customerDistrictCatalog'));
check('Customer 360 exports use canonical localized district label', export360.includes('function addressLabel(customer = {})') && export360.includes('window.KYUMGeography?.localizedDistrictLabel?.('));

// Runtime certification of the canonical geographic resolver.
const listeners = new Map();
const context = {
  console,
  navigator: { onLine: true },
  CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  document: {},
  window: {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    dispatchEvent() {},
    PetatoeLocalization: {
      effectiveLanguage: () => 'en',
      entityText: (_kind, item) => item?.name === 'حي الزهرة' ? 'Az Zahra Dist.' : item?.name === 'حي الرغامة' ? 'Al Rughamah Dist.' : item?.name || ''
    }
  }
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(geo, context, { filename: 'geographic-address.js' });
context.window.KYUMGeography.setCatalog({
  regions: [{ id: 'r', name: 'منطقة مكة المكرمة', name_en: 'Makkah Region', is_active: true }],
  cities: [{ id: 'c', region_id: 'r', name: 'جدة', name_en: 'Jeddah', is_active: true }],
  districts: [
    { id: 'z', city_id: 'c', name: 'حي الزهرة', name_en: '', is_active: true },
    { id: 'b', city_id: 'c', name: 'حي البغدادية', name_en: 'Al Baghdadiyah Dist.', is_active: true },
    { id: 'g', city_id: 'c', name: 'حي الرغامة', name_en: '', is_active: true }
  ]
});
check('Runtime: legacy address-only Zahra resolves through entity translation', context.window.KYUMGeography.localizedDistrictLabel('', 'حي الزهرة') === 'Az Zahra Dist.');
check('Runtime: source-backed Baghdadiyah resolves by English metadata', context.window.KYUMGeography.localizedDistrictLabel('', 'حي البغدادية') === 'Al Baghdadiyah Dist.');
check('Runtime: Rughamah resolves through entity translation when name_en is stale/missing', context.window.KYUMGeography.localizedDistrictLabel('', 'حي الرغامة') === 'Al Rughamah Dist.');

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed++;
}
console.log(`R44R37R2R2 legacy neighborhood display certification: ${checks.length - failed}/${checks.length} PASS`);
if (failed) process.exit(1);
