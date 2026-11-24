'use strict';
const fs = require('fs');
const path = require('path');

const ENV = { 'yt-dlp': 'VDP_YTDLP_PATH', ffmpeg: 'VDP_FFMPEG_PATH' };

/**
 * Finds a bundled/installed tool. Order: env override -> <binDir> -> PATH.
 * Returns an absolute path or null.
 */
function resolveBinary(name, binDir) {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const override = process.env[ENV[name]];
  if (override && fs.existsSync(override)) return override;
  if (binDir) {
    const p = path.join(binDir, exe);
    if (fs.existsSync(p)) return p;
  }
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { resolveBinary };
