import fs from "node:fs";

const app = fs.readFileSync("assets/js/app.js", "utf8");
const moduleText = fs.readFileSync("assets/js/installations-module.js", "utf8");
const version = JSON.parse(fs.readFileSync("version.json", "utf8"));

const checks = [
  ["quotation click passes an immediate customer snapshot", app.includes("customerName: item.customerName || customer?.name") && app.includes("quotationNumber: item.code")],
  ["instant prefill function exists", moduleText.includes("function applyInstantQuotationPrefill")],
  ["instant prefill writes customer before network verification", moduleText.includes("customerInput.value = instantCustomerLabel(intent)")],
  ["instant quotation option is rendered immediately", moduleText.includes("عرض السعر المحدد")],
  ["reference options and quotation verification run in parallel", moduleText.includes("const [quotation] = await Promise.all")],
  ["new view preserves pending prefill", moduleText.includes("preservePrefill")],
  ["navigation applies instant prefill before opening", moduleText.includes("applyInstantQuotationPrefill(detail);\n        const opened")],
  ["release version updated", version.version === "18.46.13" && version.build === 184613]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
console.log(`Instant Prefill Performance Recovery: ${checks.length}/${checks.length} PASS`);
