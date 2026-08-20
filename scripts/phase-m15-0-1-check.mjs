// Historical certification compatibility alias.
// The 9-digit invoice restriction and old completion naming were intentionally superseded.
import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['scripts/current-invoice-conversion-certification-check.mjs'],{stdio:'inherit'});
process.exit(r.status??1);
