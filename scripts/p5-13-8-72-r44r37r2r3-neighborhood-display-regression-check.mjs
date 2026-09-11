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

check('R44R37R2R3 version/build aligned', ver.version === '18.56.88' && ver.build === 185688 && pkg.version === '18.56.88');
check('PWA/cache token aligned', pwa.includes('const CURRENT_VERSION = "18.56.88";') && sw.includes('petatoe-pwa-18-56-88-neighborhood-display-regression-r44r37r2r3-p5-13-8-72'));
check('HTML asset tokens aligned', html.includes('assets/js/app.js?v=18.56.88') && html.includes('assets/js/geographic-address.js?v=18.56.88'));
check('Manifest release aligned without new migration requirement', manifest.release?.version === '18.56.88' && manifest.release?.build === 185688);
check('Geography persistent cache bumped to v3', geo.includes('geography:canonical-catalog:v3') && geo.includes('const GEO_CACHE_SCHEMA_VERSION = 3;'));
check('English resolver does not finalize Arabic fallback when catalog row is absent', geo.includes('if (lang !== "en") return normalizedFallback;') && geo.includes('return normalizeValue(translatedByName?.en);'));
check('Customer resolver rejects Arabic geography result in English', app.includes('if(geoLabel && (lang!=="en" || !/[\\u0600-\\u06FF]/.test(geoLabel))) return geoLabel;'));
check('Customer resolver has entity/name translation fallback', app.includes('String(item?.key||"").startsWith("entity.neighborhood.")'));
check('Customer resolver does not leak unresolved Arabic in English', app.includes('return sourceName&&!/[\\u0600-\\u06FF]/.test(sourceName)?sourceName:"";'));
check('Customer load awaits geography before first render', app.includes('const geographyReady=loadCustomerDistrictCatalog(false).catch') && app.includes('await geographyReady;\n    customersLoaded = true;'));
check('Customer geography failure remains non-blocking', app.includes('Customer geography catalog load deferred:'));
check('Desktop/mobile customer rows use canonical resolver', !app.includes('c.neighborhoodId?customerNeighborhoodLabel(c.neighborhoodId,c.address):(c.address||"—")'));
check('Customer 360 export uses canonical geography resolver', export360.includes('window.KYUMGeography?.localizedDistrictLabel?.('));

const listeners = new Map();
const translationRows = [
  { key: 'entity.neighborhood.z', ar: 'حي الزهرة', en: 'Az Zahra Dist.' },
  { key: 'entity.neighborhood.b', ar: 'حي البغدادية', en: 'Al Baghdadiyah Dist.' },
  { key: 'entity.neighborhood.r', ar: 'حي الرغامة', en: 'Al Rughamah Dist.' }
];
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
      getRows: () => translationRows,
      entityText: (_kind, item) => {
        const byId = translationRows.find(row => row.key === `entity.neighborhood.${item?.id || ''}`);
        if (byId) return byId.en;
        const byName = translationRows.find(row => row.ar === item?.name);
        return byName?.en || item?.name || '';
      }
    }
  }
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(geo, context, { filename: 'geographic-address.js' });

check('Runtime: empty catalog + UUID resolves English entity translation', context.window.KYUMGeography.localizedDistrictLabel('z', 'حي الزهرة') === 'Az Zahra Dist.');
check('Runtime: empty catalog + legacy Arabic address resolves English by translation name', context.window.KYUMGeography.localizedDistrictLabel('', 'حي البغدادية') === 'Al Baghdadiyah Dist.');
context.window.KYUMGeography.setCatalog({
  regions: [{ id: 'rg', name: 'منطقة مكة المكرمة', name_en: 'Makkah Region', is_active: true }],
  cities: [{ id: 'ct', region_id: 'rg', name: 'جدة', name_en: 'Jeddah', is_active: true }],
  districts: [
    { id: 's', city_id: 'ct', name: 'حي الشاطئ', name_en: 'Ash Shati Dist.', is_active: true },
    { id: 'r', city_id: 'ct', name: 'حي الرغامة', name_en: '', is_active: true }
  ]
});
check('Runtime: source name_en remains preferred in English', context.window.KYUMGeography.localizedDistrictLabel('s', 'حي الشاطئ') === 'Ash Shati Dist.');
check('Runtime: stale catalog missing name_en falls through to translation', context.window.KYUMGeography.localizedDistrictLabel('r', 'حي الرغامة') === 'Al Rughamah Dist.');

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed++;
}
console.log(`R44R37R2R3 neighborhood display regression certification: ${checks.length - failed}/${checks.length} PASS`);
if (failed) process.exit(1);
