import fs from "node:fs";
const moduleText=fs.readFileSync("assets/js/installations-module.js","utf8");
const appText=fs.readFileSync("assets/js/app.js","utf8");
const html=fs.readFileSync("index.html","utf8");
const checks=[
 ["service rows rehydrate",moduleText.includes("function hydrateServiceRows()")],
 ["options loaded state",moduleText.includes("let optionsLoaded = false")],
 ["view reset waits for options",!moduleText.includes("initializeNewView();\n        if (!editingRequestId) resetNewForm")],
 ["district select",html.includes('<select id="customerDistrict">')],
 ["district catalog query",appText.includes('.from("installation_neighborhoods")')],
 ["legacy district preserved",appText.includes("(قيمة محفوظة)")]
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} - ${name}`);if(!ok)failed++;} process.exitCode=failed?1:0;
