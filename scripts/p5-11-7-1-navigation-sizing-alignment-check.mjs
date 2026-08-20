// Historical certification compatibility alias.
// Exact legacy header dimensions were superseded by the currently approved PETATOE header identity.
import {spawnSync} from 'node:child_process';
const r=spawnSync(process.execPath,['scripts/current-navigation-header-certification-check.mjs'],{stdio:'inherit'});
process.exit(r.status??1);
