import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CATALOG=path.join(ROOT,'assets/js/localization-center.js');
const HTML=path.join(ROOT,'index.html');
const BASELINE=path.join(ROOT,'scripts/localization-coverage-baseline.json');
const AR=/[\u0600-\u06FF]/;
const ALLOWED_PREFIXES=new Set(['common','shared','sidebar','auth','dashboard','customers','representatives','referenceData','followups','contracts','invoices','users','permissions','activityLog','backups','systemHealth','diagnostics','performance','syncRecovery','systemSettings','aboutApp','pwa','salaryStatement','commissionStatement','commission','payroll','appointments','appointmentNew','appointmentSettings','execution','vehicleTreasury','seaVibePayroll','seaVibe','translationCenter','dailyOperations','dailyPerformance','dailyActivity','dailyAlerts','dailyTargets','reportsOverview','customer360','customerImport','crmService','geography']);

function read(file){return fs.readFileSync(file,'utf8');}
function listFiles(dir,ext='.js'){const out=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())out.push(...listFiles(full,ext));else if(entry.isFile()&&entry.name.endsWith(ext))out.push(full);}return out;}
function rel(file){return path.relative(ROOT,file).replaceAll('\\','/');}
function parseCatalog(){
  const sandbox={
    console:{warn(){},log(){},error(){}},
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    document:{addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;},documentElement:{},body:{}},
    CustomEvent:class CustomEvent{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
    setTimeout(){return 0;},clearTimeout(){},
    window:{screen:{width:0},matchMedia(){return{matches:false};},dispatchEvent(){},addEventListener(){}}
  };
  sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.localStorage=sandbox.localStorage;
  vm.runInNewContext(read(CATALOG),sandbox,{filename:'localization-center.js'});
  const api=sandbox.window.PetatoeLocalization;if(!api?.getRows)throw new Error('PetatoeLocalization catalog could not be evaluated');
  return api.getRows().map(row=>({key:row.key,type:row.type,ar:row.ar,en:row.en,screenKey:row.screenKey,moduleName:row.moduleName}));
}
function htmlKeys(source){const found=[];const re=/data-(?:petatoe|execution)-i18n(?:-(?:aria|title|placeholder))?=["']([^"']+)["']/g;let m;while((m=re.exec(source)))found.push(m[1]);return found;}
function htmlArabicInventory(source){
  const lines=source.split(/\r?\n/);let textCandidates=0,attributeCandidates=0;const sectionStack=[],bySection={};
  for(const line of lines){
    for(const match of line.matchAll(/<section[^>]+id=["']([^"']+)["']/g))sectionStack.push(match[1]);
    const currentSection=sectionStack.at(-1)||'shell';let added=0;
    if(AR.test(line)){
      const covered=/data-(?:petatoe|execution)-i18n/.test(line);
      const attrMatches=[...line.matchAll(/(?:placeholder|title|aria-label)=["']([^"']*[\u0600-\u06FF][^"']*)["']/g)];
      if(attrMatches.length&&!covered){attributeCandidates+=attrMatches.length;added+=attrMatches.length;}
      const textMatches=[...line.matchAll(/>([^<>]*[\u0600-\u06FF][^<>]*)</g)];
      if(textMatches.length&&!covered){textCandidates+=textMatches.length;added+=textMatches.length;}
    }
    if(added)bySection[currentSection]=(bySection[currentSection]||0)+added;
    const closes=(line.match(/<\/section>/g)||[]).length;for(let i=0;i<closes&&sectionStack.length;i++)sectionStack.pop();
  }
  return{textCandidates,attributeCandidates,total:textCandidates+attributeCandidates,bySection};
}
function jsArabicInventory(){
  const files=listFiles(path.join(ROOT,'assets/js')).filter(file=>!file.endsWith('.bak')&&rel(file)!=='assets/js/localization-center.js');
  const byFile={};
  for(const file of files){let count=0;for(const line of read(file).split(/\r?\n/)){if(!AR.test(line))continue;if(/^\s*\/\//.test(line))continue;if(/["'`]/.test(line))count++;}if(count)byFile[rel(file)]=count;}
  return byFile;
}
function fail(message){console.error(`FAIL: ${message}`);process.exitCode=1;}

const rows=parseCatalog();
const keySet=new Set();
for(const row of rows){
  if(keySet.has(row.key))fail(`duplicate catalog key ${row.key}`);keySet.add(row.key);
  if(!row.ar.trim()||!row.en.trim())fail(`missing Arabic/English value for ${row.key}`);
  if(AR.test(row.en))fail(`Arabic leakage in English value for ${row.key}`);
  const prefix=row.key.split('.')[0];if(!ALLOWED_PREFIXES.has(prefix))fail(`unrouted catalog namespace ${prefix} (${row.key})`);
}
const source=read(CATALOG);
for(const required of ["const routeFor=(key)=>","value.startsWith('appointmentNew.')","value.startsWith('vehicleTreasury.')","value.startsWith('seaVibePayroll.')","value.startsWith('translationCenter.')","value.startsWith('representatives.')","value.startsWith('referenceData.')","value.startsWith('reportsOverview.')","value.startsWith('customer360.')||value.startsWith('customerImport.')","value.startsWith('crmService.')","value.startsWith('geography.')","moduleNameFor=key=>routeFor(key).moduleName"]){if(!source.includes(required))fail(`routing contract missing: ${required}`);}
const html=read(HTML);
for(const key of htmlKeys(html)){if(!keySet.has(key))fail(`HTML references missing localization key ${key}`);}
const staticInventory=htmlArabicInventory(html);
const runtimeByFile=jsArabicInventory();
const runtimeTotal=Object.values(runtimeByFile).reduce((a,b)=>a+b,0);
const inventory={catalogKeys:rows.length,staticHtml:staticInventory,runtimeArabic:{total:runtimeTotal,byFile:runtimeByFile}};

if(process.argv.includes('--write-baseline')){
  fs.writeFileSync(BASELINE,JSON.stringify({phase:'R44R19',purpose:'Non-increase baseline for remaining hard-coded Arabic candidates while localization waves reduce coverage debt.',inventory},null,2)+'\n');
  console.log(`WROTE ${rel(BASELINE)}`);
}else{
  if(!fs.existsSync(BASELINE))fail('localization coverage baseline is missing');
  else{
    const baseline=JSON.parse(read(BASELINE)).inventory;
    if(staticInventory.total>baseline.staticHtml.total)fail(`static HTML localization debt increased: ${staticInventory.total} > ${baseline.staticHtml.total}`);
    const baseFiles=baseline.runtimeArabic.byFile||{};
    for(const [file,count] of Object.entries(runtimeByFile)){const allowed=Number(baseFiles[file]||0);if(count>allowed)fail(`runtime Arabic debt increased in ${file}: ${count} > ${allowed}`);}
  }
}

const top=Object.entries(runtimeByFile).sort((a,b)=>b[1]-a[1]).slice(0,15);
console.log(`Localization catalog: ${rows.length} keys; parity/English leakage: OK`);
console.log(`Static HTML uncovered candidates: ${staticInventory.total} (text ${staticInventory.textCandidates}, attributes ${staticInventory.attributeCandidates})`);
const topSections=Object.entries(staticInventory.bySection||{}).sort((a,b)=>b[1]-a[1]).slice(0,12);console.log('Top static screen coverage debt:');for(const [section,count] of topSections)console.log(`  ${String(count).padStart(4)}  ${section}`);
console.log(`Runtime JS Arabic-literal candidate lines: ${runtimeTotal}`);
console.log('Top runtime coverage debt:');for(const [file,count] of top)console.log(`  ${String(count).padStart(4)}  ${file}`);
if(!process.exitCode)console.log('PASS: localization architecture & non-increase coverage gate');
