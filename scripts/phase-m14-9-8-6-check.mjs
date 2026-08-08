import fs from "node:fs";
const scheduling=fs.readFileSync(new URL("../assets/js/installation-scheduling.js",import.meta.url),"utf8");
const service=fs.readFileSync(new URL("../assets/js/installations-service.js",import.meta.url),"utf8");
const version=JSON.parse(fs.readFileSync(new URL("../version.json",import.meta.url),"utf8"));
const checks=[
 ["day card displays customer phone",scheduling.includes("رقم العميل:")&&scheduling.includes("r.customerPhone")],
 ["day card displays representative",scheduling.includes("المندوب:")&&scheduling.includes("r.representativeName")],
 ["service maps customer phone",service.includes("customerPhone:r.customer?.phone")],
 ["service maps representative name",service.includes("representativeName:r.representative?.full_name")],
 ["existing technician remains",scheduling.includes("الفني:")],
 ["existing card actions remain",scheduling.includes("data-day-reschedule")&&scheduling.includes("data-day-open-request")],
 ["version is synchronized",version.version==="18.46.5"&&version.build===184605]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} - ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
console.log(`Installation day details display: ${checks.length}/${checks.length} PASS`);
