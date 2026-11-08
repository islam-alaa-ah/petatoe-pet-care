// Local read-only comparison. No deployment, SQL or Supabase requests.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [mode,folder]=process.argv.slice(2);
if(!['baseline','installed'].includes(mode)||!folder){console.error('Usage: node scripts/sc1-preflight-check.mjs baseline|installed /absolute/path/to/app');process.exit(2)}
const manifest=JSON.parse(fs.readFileSync(new URL('../docs/SC1-cache/manifest.json',import.meta.url),'utf8'));
let failures=0;
function check(file,expected){let actual='missing';try{actual=createHash('sha256').update(fs.readFileSync(path.join(path.resolve(folder),file))).digest('hex')}catch(_){}const pass=actual===expected;console.log(`${pass?'PASS':'FAIL'} ${file}`);if(!pass)failures++}
for(const file of manifest.modifiedFiles)check(file.path,mode==='baseline'?file.beforeSha256:file.afterSha256);
for(const file of manifest.protectedFiles)check(file.path,file.sha256);
if(mode==='installed')for(const file of manifest.addedFiles)check(file.path,file.sha256);
console.log(failures?'STOP: baseline differs; review before replacing files.':`PASS: ${mode} files match SC1 ${manifest.version}.`);
process.exitCode=failures?1:0;
