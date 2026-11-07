// Read-only. Run from the unpacked P3 bundle before copying any files.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const [mode,folder]=process.argv.slice(2);
if(!['baseline','installed'].includes(mode)||!folder){
  console.error('Usage: node scripts/p3-preflight-check.mjs baseline|installed /absolute/path/to/app');
  process.exit(2);
}
const manifest=JSON.parse(fs.readFileSync(new URL('../docs/P3-notifications/manifest.json',import.meta.url),'utf8'));
let failures=0;
for(const file of manifest.modifiedFiles){
  let actual='missing';
  try{actual=createHash('sha256').update(fs.readFileSync(path.join(path.resolve(folder),file.path))).digest('hex')}catch(_){}
  const expected=mode==='baseline'?file.beforeSha256:file.afterSha256,pass=actual===expected;
  console.log((pass?'PASS ':'FAIL ')+file.path);if(!pass)failures+=1;
}
console.log(failures?'STOP: files differ; do not overwrite this baseline.':`PASS: ${manifest.modifiedFiles.length}/${manifest.modifiedFiles.length} files match ${mode}.`);
process.exitCode=failures?1:0;
