#!/usr/bin/env node
'use strict';
// TEST FIXTURE ONLY. Imitates the parts of yt-dlp's CLI that the app uses, so the queue/progress/pause/
// cancel/retry code can be tested without internet access. The shipped app uses the real yt-dlp.
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => argv[argv.indexOf(f) + 1];

if (has('--version')) { console.log('2099.01.01'); process.exit(0); }

const u = new URL(argv[argv.length - 1]);
const slug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'video');
const key = u.hostname + u.pathname;

if (/unsupported/.test(key)) { console.error(`ERROR: Unsupported URL: ${u}`); process.exit(1); }
if (/private/.test(key)) { console.error("ERROR: [fake] abc: Private video. Sign in if you've been granted access to this video"); process.exit(1); }

if (has('-J')) {
  console.log(JSON.stringify({
    title: `Fake ${slug}`, thumbnail: 'https://example.com/t.jpg', extractor_key: 'Fake', duration: 62.4, webpage_url: String(u),
    formats: [
      { format_id: '137', ext: 'mp4', height: 1080, width: 1920, fps: 30, vcodec: 'avc1', acodec: 'none', filesize: 5000000, resolution: '1920x1080' },
      { format_id: '136', ext: 'mp4', height: 720, width: 1280, fps: 30, vcodec: 'avc1', acodec: 'none', filesize: 3000000, resolution: '1280x720' },
      { format_id: '140', ext: 'm4a', vcodec: 'none', acodec: 'mp4a', filesize: 1000000, resolution: 'audio only' },
      { format_id: 'sb0', ext: 'mhtml', vcodec: 'none', acodec: 'none', format_note: 'storyboard' },
    ],
  }));
  process.exit(0);
}

const dir = val('-P');
const file = path.join(dir, `Fake ${slug} [abc123].mp4`);
console.log(`__FILE__${file}`); // before_dl print
fs.writeFileSync(`${file}.part`, 'partial');
process.on('SIGTERM', () => process.exit(143));

const failMarker = path.join(dir, `.netfail-${slug}`);
if (/alwaysnet/.test(key) || (/netfail/.test(key) && !fs.existsSync(failMarker))) {
  fs.writeFileSync(failMarker, '1');
  console.error('ERROR: unable to download video data: Connection reset by peer');
  process.exit(1);
}

const slow = /slow/.test(key);
const steps = slow ? 60 : 8, ms = slow ? 20 : 10, size = 2_000_000;
let i = 0;
const timer = setInterval(() => {
  i += 1;
  console.error(`__PROG__downloading|${(size * i) / steps}|${size}|NA|${500000 + i}|${steps - i}`);
  if (i >= steps) {
    clearInterval(timer);
    console.error(`__PROG__finished|${size}|${size}|NA|NA|NA`);
    fs.rmSync(`${file}.part`, { force: true });
    fs.writeFileSync(file, 'x'.repeat(4096));
    console.log(`__FILE__${file}`); // after_move print
    process.exit(0);
  }
}, ms);
