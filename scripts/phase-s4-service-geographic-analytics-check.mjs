import fs from 'node:fs';
const root=new URL('../',import.meta.url);const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const html=read('index.html'),js=read('assets/js/installation-operations-reports.js'),svc=read('assets/js/installations-service.js'),css=read('assets/css/installation-operations-reports.css'),ver=JSON.parse(read('version.json'));
const checks=[
 ['geographic section',html.includes('installationServiceGeographicTitle')&&html.includes('التحليل الجغرافي للخدمات')],
 ['geographic KPI ids',html.includes('installationServiceGeoRegions')&&html.includes('installationServiceGeoCities')&&html.includes('installationServiceGeoDistricts')],
 ['region city district tables',html.includes('installationServiceRegionBody')&&html.includes('installationServiceCityBody')&&html.includes('installationServiceDistrictBody')],
 ['representative service table',html.includes('installationServiceRepresentativeBody')],
 ['previous day comparison table',html.includes('installationServiceComparisonBody')&&html.includes('مقارنة الخدمات مع اليوم السابق')],
 ['request geography loaded',svc.includes("neighborhood_id,status,scheduled_date")&&svc.includes("from('installation_neighborhoods').select('id,name,city_id,region_id,city,region')")],
 ['execution rows carry canonical geography',svc.includes('neighborhoodName:geo.neighborhoodName')&&svc.includes('regionName:geo.regionName')&&svc.includes('cityName:geo.cityName')],
 ['dimension aggregation',js.includes('function serviceDimensionRows(data,keyFn,labelFn)')],
 ['geographic renderer',js.includes('function renderServiceGeographic(data,previousData)')&&js.includes("serviceGeoTable(regions,'installationServiceRegionBody')")],
 ['same-filter previous day load',js.includes('const [data,previousData]=await Promise.all')&&js.includes('date:isoDate(previous)')],
 ['comparison metrics',js.includes('executionChange')&&js.includes('quantityChange')&&js.includes('revenueChange')&&js.includes('profitChange')],
 ['renderer wired',js.includes('renderServiceGeographic(data,state.servicePreviousData)')],
 ['responsive geographic css',css.includes('.installation-service-geographic-section')&&css.includes('.installation-service-geographic-grid')],
 ['version and cache token',ver.version==='18.53.15'&&ver.build===185315&&ver.cacheToken==='kyum-crm-pwa-18-53-15-service-geographic-s4']
];
let fail=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`);if(!ok)fail++}console.log(`S4 ${checks.length-fail}/${checks.length} PASS`);process.exitCode=fail?1:0;
