'use strict';
const fs = require('fs');
const path = require('path');

/** Tiny file+console logger with single-file rotation at 1 MB. */
function createLogger(dir) {
  let file = null;
  if (dir) {
    try { fs.mkdirSync(dir, { recursive: true }); file = path.join(dir, 'app.log'); } catch { file = null; }
  }
  function write(level, msg, extra) {
    const line = `${new Date().toISOString()} [${level}] ${msg}${extra ? ' ' + (extra.stack || extra.message || JSON.stringify(extra)) : ''}\n`;
    if (process.env.VDP_QUIET !== '1') (level === 'error' ? process.stderr : process.stdout).write(line);
    if (!file) return;
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) fs.renameSync(file, file + '.old');
      fs.appendFileSync(file, line);
    } catch { /* logging must never crash the app */ }
  }
  return { info: (m, e) => write('info', m, e), warn: (m, e) => write('warn', m, e), error: (m, e) => write('error', m, e) };
}

module.exports = { createLogger };
