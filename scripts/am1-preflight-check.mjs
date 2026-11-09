// Local file hashes only. Never deploys, calls an API, or executes SQL.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [mode,folder]=process.argv.slice(2);
if(!['baseline','installed'].includes(mode)||!folder){console.error('Usage: node scripts/am1-preflight-check.mjs baseline|installed /absolute/path/to/app');process.exit(2);}
const manifest=JSON.parse(fs.readFileSync(new URL('../docs/AM1/manifest.json',import.meta.url),'utf8'));
let failures=0;
function check(file,expected){let actual='missing';try{actual=createHash('sha256').update(fs.readFileSync(path.join(path.resolve(folder),file))).digest('hex');}catch(_){}const ok=actual===expected;if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${file}`);}
for(const file of manifest.modifiedFiles)check(file.path,mode==='baseline'?file.beforeSha256:file.afterSha256);
for(const file of manifest.protectedFiles)check(file.path,file.sha256);
if(mode==='installed')for(const file of manifest.addedFiles)check(file.path,file.sha256);
console.log(failures?'STOP: source differs; review before replacing files.':`PASS: ${mode} matches AM1 ${manifest.version}.`);
process.exitCode=failures?1:0;
