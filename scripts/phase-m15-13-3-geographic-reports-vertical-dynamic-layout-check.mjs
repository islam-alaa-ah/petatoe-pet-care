import fs from 'node:fs';
const css=fs.readFileSync('assets/css/installation-operations-reports.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8'));
const checks=[
 ['vertical single-column geographic reports',/\.installation-service-geographic-grid\{[^}]*grid-template-columns:minmax\(0,1fr\)/s.test(css)],
 ['dynamic table height with no max-height cap',/\.installation-service-geographic-grid \.table-scroll\{[^}]*max-height:none[^}]*height:auto/s.test(css)],
 ['horizontal overflow contained per table',/\.installation-service-geographic-grid \.table-scroll\{[^}]*overflow-x:auto/s.test(css)],
 ['vertical overflow not clipped by scroll wrapper',/\.installation-service-geographic-grid \.table-scroll\{[^}]*overflow-y:visible/s.test(css)],
 ['geographic panels bounded to own width',/\.installation-service-geographic-grid>\.panel\{[^}]*max-width:100%[^}]*overflow:hidden/s.test(css)],
 ['region report retained',html.includes('installationServiceRegionBody')],
 ['city report retained',html.includes('installationServiceCityBody')],
 ['district report retained',html.includes('installationServiceDistrictBody')],
 ['representative report retained',html.includes('installationServiceRepresentativeBody')],
 ['version bumped',version.version==='18.53.30' && version.build===185330]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
console.log(`M15.13.3: ${checks.length}/${checks.length} PASS`);
