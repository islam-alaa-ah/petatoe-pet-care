import fs from 'node:fs';
const src=fs.readFileSync(new URL('../assets/js/installation-execution.js', import.meta.url),'utf8');
const checks=[
  ['grossTotal helper defined', /function\s+grossTotal\s*\(r\)/.test(src)],
  ['grossTotal helper defined before cardHtml use', src.indexOf('function grossTotal(r)')>=0 && src.indexOf('function grossTotal(r)')<src.indexOf('function cardHtml(r)')],
  ['today card uses gross total', /الإجمالي شامل الضريبة:[\s\S]*grossTotal\(r\)/.test(src)],
  ['gross total falls back to services plus tax', /totalServicesAmount[\s\S]*taxAmount/.test(src)],
];
let pass=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} - ${name}`); if(ok)pass++;}
console.log(`${pass}/${checks.length} PASS`);
if(pass!==checks.length)process.exit(1);
