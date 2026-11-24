'use strict';
// Places yt-dlp.exe and ffmpeg.exe into desktop-app/bin (bundled by the installer).
//  - yt-dlp:  downloaded from the official GitHub release, SHA-256 verified against the published checksums.
//  - ffmpeg:  copied from the `ffmpeg-static` npm package (installed with desktop-app dependencies).
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const BIN = path.join(__dirname, '..', 'desktop-app', 'bin');
const BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'video-downloader-pro' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        return resolve(get(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function prepareYtDlp() {
  const exe = await get(`${BASE}/yt-dlp.exe`);
  const sums = (await get(`${BASE}/SHA2-256SUMS`)).toString('utf8');
  const line = sums.split('\n').find((l) => /\s\*?yt-dlp\.exe$/.test(l.trim()));
  if (!line) throw new Error('Checksum for yt-dlp.exe not found');
  const expected = line.trim().split(/\s+/)[0].toLowerCase();
  const actual = crypto.createHash('sha256').update(exe).digest('hex');
  if (expected !== actual) throw new Error('yt-dlp.exe checksum mismatch; aborting');
  fs.writeFileSync(path.join(BIN, 'yt-dlp.exe'), exe);
  console.log('yt-dlp.exe downloaded and verified.');
}

function prepareFfmpeg() {
  let src;
  try { src = require(path.join(__dirname, '..', 'desktop-app', 'node_modules', 'ffmpeg-static')); }
  catch { throw new Error('ffmpeg-static not installed. Run "npm install" in desktop-app first.'); }
  if (!src || !fs.existsSync(src)) throw new Error('ffmpeg-static did not provide a binary for this platform.');
  fs.copyFileSync(src, path.join(BIN, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
  console.log('ffmpeg copied from ffmpeg-static.');
}

(async () => {
  fs.mkdirSync(BIN, { recursive: true });
  try { await prepareYtDlp(); } catch (e) { console.error(`yt-dlp: ${e.message}`); process.exitCode = 1; }
  try { prepareFfmpeg(); } catch (e) { console.error(`ffmpeg: ${e.message}`); process.exitCode = 1; }
})();
