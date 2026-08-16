import fs from 'node:fs';
const loc=fs.readFileSync('assets/js/localization-center.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('assets/js/app.js','utf8');
const invoices=fs.readFileSync('assets/js/sales-invoices.js','utf8');
const requiredPrefixes=['customers.','followups.','contracts.','invoices.','users.'];
const keyMatches=[...loc.matchAll(/\["([^"]+)","([^"]+)","([^"]*)","([^"]*)"\]/g)];
const catalog=new Map(keyMatches.map(m=>[m[1],{type:m[2],ar:m[3],en:m[4]}]));
const referenced=[...html.matchAll(/data-petatoe-i18n(?:-placeholder|-aria|-title)?="([^"]+)"/g)].map(m=>m[1]);
const missing=[...new Set(referenced.filter(k=>requiredPrefixes.some(p=>k.startsWith(p))&&!catalog.has(k)))];
const arabic=/[\u0600-\u06FF]/;
const englishLeaks=[...catalog.entries()].filter(([k,v])=>requiredPrefixes.some(p=>k.startsWith(p))&&arabic.test(v.en));
const assertions=[
  ['customer catalog coverage', [...catalog.keys()].filter(k=>requiredPrefixes.some(p=>k.startsWith(p))).length>=170],
  ['HTML referenced keys exist', missing.length===0],
  ['English catalog has no Arabic leakage', englishLeaks.length===0],
  ['customer renderer uses canonical translation', app.includes('customerT("customers.action.view"')],
  ['followup renderer translates method/result', app.includes('followupMethodLabel(item.method)')&&app.includes('followupResultLabel(item.result)')],
  ['contracts renderer translates status', app.includes('quotationStatusLabel(canonicalStatus)')],
  ['sales invoices renderer uses localization', invoices.includes('PetatoeLocalization')&&invoices.includes('invoices.empty')],
  ['user default language UI present', html.includes('id="userDefaultLanguage"')],
];
let failed=0;
for(const [name,ok] of assertions){console.log(`${ok?'PASS':'FAIL'} - ${name}`);if(!ok)failed++;}
if(missing.length)console.log('Missing keys:',missing);
if(englishLeaks.length)console.log('English leaks:',englishLeaks.map(([k])=>k));
console.log(`Catalog keys in scope: ${[...catalog.keys()].filter(k=>requiredPrefixes.some(p=>k.startsWith(p))).length}`);
if(failed)process.exit(1);
