import fs from 'node:fs';
const src = fs.readFileSync(new URL('../assets/js/daily-operations-service.js', import.meta.url), 'utf8');
const checks = [
  ['task-specific permission guard exists', src.includes('async function requireTaskEditPermission(taskKey)')],
  ['task permission key drives edit check', src.includes('canScreen?.(permissionKey, "edit")')],
  ['dailyOperations edit no longer blocks task completion', !src.includes('async function setTaskState(taskKey, completed, workDate = todayIso(), context = {}) {\n    requirePermission("edit");')],
  ['task completion still uses canonical online writer', src.includes('return await setTaskStateOnline(taskKey, completed, workDate);')],
  ['offline queue remains registered', src.includes('register?.("daily_task_completions"')]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
