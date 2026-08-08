import fs from "node:fs";

const execution = fs.readFileSync("assets/js/installation-execution.js", "utf8");
const service = fs.readFileSync("assets/js/installations-service.js", "utf8");
const version = JSON.parse(fs.readFileSync("version.json", "utf8"));
const checks = [
  ["explicit lock decision", service.includes("lockIdentity")],
  ["super admin all scope", service.includes("role==='super_admin'?'all'")],
  ["technician role condition", service.includes("isTechnicianRole=role==='viewer'")],
  ["own scope condition", service.includes("accessMode==='own'")],
  ["UI locks by explicit flag", execution.includes("executionIdentity?.lockIdentity===true")],
  ["all technicians option", execution.includes("كل الفنيين")],
  ["all teams option", execution.includes("كل الفرق المسموح بها")],
  ["version synchronized", version.version === "18.49.1" && version.build === 184901]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}: ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
