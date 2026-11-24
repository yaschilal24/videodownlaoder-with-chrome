'use strict';
// Verifies the toolchain, installs npm packages, then fetches yt-dlp/FFmpeg.
// Run from the project root:  node scripts/install-dependencies.js
const { spawnSync } = require('child_process');
const path = require('path');

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`Node.js 22 or newer is required (found ${process.versions.node}).`);
  process.exit(1);
}

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')}   (in ${cwd})`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`Command failed: ${cmd} ${args.join(' ')}`); process.exit(r.status || 1); }
}

const app = path.join(__dirname, '..', 'desktop-app');
run('npm', ['install'], app);
run('node', [path.join(__dirname, 'prepare-binaries.js')], path.join(__dirname, '..'));
console.log('\nAll dependencies installed.');
