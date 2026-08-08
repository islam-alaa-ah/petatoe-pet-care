import fs from 'node:fs';
const execution=fs.readFileSync(new URL('../assets/js/installation-execution.js',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../assets/js/installations-service.js',import.meta.url),'utf8');
const checks=[
  ['local date key',execution.includes('localDateKey')&&!execution.includes('toISOString().slice(0,10)')],
  ['reset date on view',execution.includes("load({resetDate:true})")],
  ['execution identity load',execution.includes('executionIdentity')],
  ['technician filter locked',execution.includes("tech.disabled=true")],
  ['team filter locked',execution.includes("team.disabled=true")],
  ['own binding query',service.includes("installation_user_technician_bindings")],
  ['service export',service.includes('executionWorkspace,executionIdentity,selectExecutionRequest')]
];
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)process.exitCode=1;}
