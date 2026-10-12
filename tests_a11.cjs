const fs=require('fs'), assert=require('assert');
const js=fs.readFileSync(__dirname+'/assets/js/sales-reports.js','utf8');
const css=fs.readFileSync(__dirname+'/assets/css/sales-reports.css','utf8');
let n=0;const check=(x,s)=>{assert.ok(x,s);n++};
const entries=[
 ['payment mini table',js.includes('sales-payment-table-row')],
 ['donut size increased',css.includes('width:280px;height:280px')],
 ['payment capped table',css.includes('max-width:560px')],
 ['responsive payment',css.includes('grid-row:1')],
 ['monthly label floats above bar',js.includes('bottom:${labelBottom}')],
 ['monthly headroom',js.includes('value / max * 82')],
 ['weekday label floats above bar',js.includes('class="sales-weekday-value"')],
 ['weekday headroom',js.includes('value / max * 80')],
 ['month comparisons centered labels',js.includes("labelAnchor = 'middle';")&&js.includes('labelX = entry.cx;')],
 ['month comparisons width',js.includes('isMonth ? 2160')],
 ['comparison separate close heights',js.includes('lane === 0 ? 28 : 10')],
 ['daily axis padding',js.includes('pad = { left: 144')],
 ['daily axis labels offset',js.includes('pad.left - 28')],
 ['tooltip intact',js.includes('function bindDailyTooltip(host)')],
 ['all day ticks',js.includes('const day = i + 1;')],
 ['comparison colors intact',css.includes('[data-role="change"].positive')&&css.includes('[data-role="change"].negative')],
 ['no change to sales RPC',!js.includes('CREATE OR REPLACE FUNCTION')],
 ['single source monthly definition',(js.match(/function renderMonthly\(/g)||[]).length===1],
 ['single source weekday definition',(js.match(/function renderWeekday\(/g)||[]).length===1],
 ['single monthly CSS owner',(css.match(/\.sales-month-value\{/g)||[]).length===1],
];
entries.forEach(([s,v])=>check(v,s));
console.log('A11 '+n+'/'+n+' PASS');
