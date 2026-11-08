// Local read-only comparison. Does not deploy, write files or contact Supabase.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [mode,folder]=process.argv.slice(2);
if(!['baseline','installed'].includes(mode)||!folder){
  console.error('Usage: node scripts/p5-finance-preflight-check.mjs baseline|installed /absolute/path/to/app');process.exit(2);
}
const manifest=JSON.parse(fs.readFileSync(new URL('../docs/P5-finance/manifest.json',import.meta.url),'utf8'));
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let failures=0;
function check(relative,expected){
  let actual='missing';try{actual=sha(path.join(path.resolve(folder),relative))}catch(_){}
  const pass=actual===expected;console.log(`${pass?'PASS':'FAIL'} ${relative}`);if(!pass)failures++;
}
for(const file of manifest.modifiedFiles)check(file.path,mode==='baseline'?file.beforeSha256:file.afterSha256);
for(const file of manifest.protectedFiles)check(file.path,file.sha256);
if(mode==='installed')for(const file of manifest.addedFiles)check(file.path,file.sha256);
console.log(failures?'STOP: files differ; review the latest baseline before replacing anything.':`PASS: ${mode} files match P5 ${manifest.version}.`);
process.exitCode=failures?1:0;
