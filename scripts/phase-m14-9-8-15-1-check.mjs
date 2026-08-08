import fs from "node:fs";
const html=fs.readFileSync("index.html","utf8");
const js=fs.readFileSync("assets/js/installations-module.js","utf8");
const css=fs.readFileSync("assets/css/installation-request-inline-dialogs.css","utf8");
const checks=[
 ["context ids",["installationServicesEditDistrict","installationServicesEditLocation","installationServicesEditCustomerOrder","installationServicesEditQuotation"].every(x=>html.includes(x))],
 ["context population",js.includes("installationServicesEditDistrict")&&js.includes("installationServicesEditQuotation")],
 ["mobile data labels",js.includes('data-label=\"الخدمة\"')&&css.includes("content:attr(data-label)")],
 ["horizontal overflow removed",css.includes("overflow-x:hidden")&&css.includes("table-layout:fixed")],
 ["responsive context",css.includes("installation-services-edit-context")&&css.includes("@media(max-width:520px)")],
];
let failed=0;for(const [n,ok] of checks){console.log(`${ok?"PASS":"FAIL"}: ${n}`);if(!ok)failed++;}if(failed)process.exit(1);
