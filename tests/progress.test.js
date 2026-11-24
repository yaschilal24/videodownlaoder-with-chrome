'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseProgressLine, buildArgs, formatArgs } = require('../desktop-app/backend/services/DownloadService');
const { VideoInfoService } = require('../desktop-app/backend/services/VideoInfoService');

test('parseProgressLine reads real yt-dlp template output', () => {
  const p = parseProgressLine('__PROG__downloading|524288|1048576|NA|262144.5|2');
  assert.deepEqual(p, { status: 'downloading', downloadedBytes: 524288, totalBytes: 1048576, speed: 262144.5, eta: 2, percent: 50 });
});

test('parseProgressLine falls back to estimated size and handles NA', () => {
  const p = parseProgressLine('__PROG__downloading|100|NA|400|NA|NA');
  assert.equal(p.totalBytes, 400); assert.equal(p.percent, 25); assert.equal(p.speed, 0); assert.equal(p.eta, null);
  assert.equal(parseProgressLine('[download] Destination: x'), null);
});

test('buildArgs never lets the URL act as an option and uses no shell metacharacters', () => {
  const args = buildArgs({ url: 'https://example.com/?a=1&b=$(calc)', format: 'mp4', quality: '720', outputDir: '/d', ffmpegDir: '/ff' });
  const sep = args.indexOf('--');
  assert.equal(args[sep + 1], 'https://example.com/?a=1&b=$(calc)');
  assert.equal(args.length, sep + 2);
  assert.ok(args.includes('--ffmpeg-location'));
  assert.ok(args.join(' ').includes('height<=720'));
});

test('formatArgs for audio, webm, mp4', () => {
  assert.ok(formatArgs('mp3', 'best').includes('--audio-format'));
  assert.ok(formatArgs('webm', '1080').includes('webm'));
  assert.ok(formatArgs('mp4', 'best').join(' ').includes('merge-output-format mp4'));
});

test('VideoInfoService.normalize builds quality list and blocks DRM-only media', () => {
  const info = VideoInfoService.normalize({ title: 't', duration: 10.2, formats: [
    { format_id: '1', ext: 'mp4', height: 1080, vcodec: 'avc1', acodec: 'none' },
    { format_id: '2', ext: 'mp4', height: 720, vcodec: 'avc1', acodec: 'mp4a' },
    { format_id: '3', ext: 'm4a', vcodec: 'none', acodec: 'mp4a' }] });
  assert.deepEqual(info.heights, [1080, 720]); assert.deepEqual(info.audioExtensions, ['m4a']); assert.equal(info.duration, 10);
  assert.throws(() => VideoInfoService.normalize({ formats: [{ format_id: '1', ext: 'mp4', height: 1080, vcodec: 'avc1', acodec: 'mp4a', has_drm: true }] }), /copy-protected/);
});
