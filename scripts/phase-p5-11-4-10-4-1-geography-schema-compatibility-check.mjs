// Historical certification compatibility alias.
// The original phase assertions targeted superseded geography implementation details.
// Current authoritative coverage lives in current-geography-certification-check.mjs.
import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['scripts/current-geography-certification-check.mjs'],{stdio:'inherit'});
process.exit(r.status??1);
