'use strict';
const path = require('path');
const { execFile } = require('child_process');
const { resolveBinary } = require('../utils/binaries');

function run(bin, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout)));
  });
}

/** Locates FFmpeg and yt-dlp and reports their status (used by Settings and error handling). */
class FFmpegService {
  constructor({ binDir }) { this.binDir = binDir; }

  ffmpegPath() { return resolveBinary('ffmpeg', this.binDir); }
  ytDlpPath() { return resolveBinary('yt-dlp', this.binDir); }
  /** Directory passed to yt-dlp's --ffmpeg-location (null if ffmpeg is missing). */
  ffmpegDir() { const p = this.ffmpegPath(); return p ? path.dirname(p) : null; }

  async getFfmpegStatus() {
    const p = this.ffmpegPath();
    if (!p) return { found: false, version: null, path: null };
    const out = await run(p, ['-version']);
    const m = out && out.match(/ffmpeg version (\S+)/i);
    return { found: !!out, version: m ? m[1] : null, path: p };
  }

  async getYtDlpStatus() {
    const p = this.ytDlpPath();
    if (!p) return { found: false, version: null, outdated: false, path: null };
    const out = await run(p, ['--version']);
    const version = out ? out.trim() : null;
    let outdated = false;
    const m = version && version.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
    if (m) outdated = (Date.now() - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000 > 120; // site extractors break quickly
    return { found: !!version, version, outdated, path: p };
  }
}

module.exports = { FFmpegService };
