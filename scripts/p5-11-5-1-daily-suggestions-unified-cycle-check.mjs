import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const migration = read('supabase/migrations/phase_p5_11_5_1_daily_suggestions_unified_cycle_recovery.sql');
const app = read('assets/js/app.js');
const version = JSON.parse(read('version.json'));

const replenisher = migration.match(/create or replace function public\.replenish_daily_customer_suggestions[\s\S]*?\n\$\$;/i)?.[0] || '';
const getter = migration.match(/create or replace function public\.get_daily_customer_suggestions\([\s\S]*?\n\$\$;/i)?.[0] || '';
const team = migration.match(/create or replace function public\.get_daily_customer_suggestions_team_summary[\s\S]*?\n\$\$;/i)?.[0] || '';

const checks = [
  ['unified target is 20 active suggestions', /greatest\(20 - v_active, 0\)/.test(replenisher)],
  ['company/individual split removed from replenisher', !/شركة|فردي|c\.customer_type\s*=/.test(replenisher)],
  ['representative is not a selection gate', !/can_access_representative|representative_id\s*=/.test(replenisher)],
  ['cycle number is persisted', /add column if not exists cycle_no/.test(migration) && /cycle_no\s*=\s*v_cycle/.test(replenisher)],
  ['customer cannot repeat inside current cycle', /history\.cycle_no = v_cycle[\s\S]*history\.customer_id = c\.id/.test(replenisher)],
  ['new cycle starts only after all current customers appeared', /v_shown_in_cycle >= v_total_customers[\s\S]*v_cycle := v_cycle \+ 1/.test(replenisher)],
  ['same-day duplicate is blocked', /same_day\.suggestion_date = p_suggestion_date[\s\S]*same_day\.customer_id = c\.id/.test(replenisher)],
  ['customers contacted today are excluded', /contacted_today\.contact_date = p_suggestion_date/.test(replenisher)],
  ['getter exposes one sequence without type ordering', /order by s\.sequence_no/.test(getter) && !/case when s\.customer_type/.test(getter)],
  ['team summary uses unified totals', /total_active/.test(team) && /total_completed/.test(team) && !/filter\(where s\.status='active' and s\.customer_type/.test(team)],
  ['daily UI no longer handles type tabs', !/data-daily-suggested-type/.test(app) && !/dailySuggestedCustomerType/.test(app)],
  ['saved follow-up refreshes permission-owned daily snapshot', /await loadDailyOperations\(true\)/.test(app)],
  ['daily target helper defaults to 20', /dailySuggestedProgressPercent\(completed, target = 20\)/.test(app)],
  ['release metadata is current', /^18\.55\.\d+$/.test(version.version)]
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (ok) pass++;
}
console.log(`\n${pass}/${checks.length} PASS`);
if (pass !== checks.length) process.exit(1);
