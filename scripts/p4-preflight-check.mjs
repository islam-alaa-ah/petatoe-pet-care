// Read-only file comparison. Run from this unpacked P4 bundle.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [mode,folder]=process.argv.slice(2);
if(!['baseline','installed'].includes(mode)||!folder){
 console.error('Usage: node scripts/p4-preflight-check.mjs baseline|installed /absolute/path/to/app');process.exit(2);
}
const manifest=JSON.parse(fs.readFileSync(new URL('../docs/P4-execution/manifest.json',import.meta.url),'utf8'));
let failures=0;
for(const file of manifest.modifiedFiles){
 let actual='missing';try{actual=createHash('sha256').update(fs.readFileSync(path.join(path.resolve(folder),file.path))).digest('hex')}catch(_){}
 const expected=mode==='baseline'?file.beforeSha256:file.afterSha256,pass=actual===expected;
 console.log((pass?'PASS ':'FAIL ')+file.path);if(!pass)failures++;
}
console.log(failures?'STOP: baseline differs; review before replacing files.':`PASS: ${manifest.modifiedFiles.length} files match ${mode}.`);
process.exitCode=failures?1:0;
