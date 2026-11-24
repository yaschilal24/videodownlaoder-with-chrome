'use strict';
const test = require('node:test');
const assert = require('node:assert');
const V = require('../desktop-app/backend/utils/validators');
const { classifyYtDlpError } = require('../desktop-app/backend/utils/errors');

test('validateUrl accepts normal https/http links', () => {
  assert.equal(V.validateUrl('https://www.example.com/watch?v=1').ok, true);
  assert.equal(V.validateUrl('  http://example.org/a ').ok, true);
});

test('validateUrl rejects bad input', () => {
  const bad = [undefined, null, 42, '', '   ', 'not a url', 'javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x',
    'https://user:pw@example.com/', 'https://exa mple.com', 'http://localhost/x', 'http://127.0.0.1:8080', 'http://192.168.1.5/x',
    'http://10.0.0.1', 'http://172.20.0.1', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://printer.local/', 'https://example.com/' + 'a'.repeat(2100)];
  for (const b of bad) assert.equal(V.validateUrl(b).ok, false, `should reject ${String(b).slice(0, 40)}`);
});

test('sanitizeFilename removes dangerous characters and reserved names', () => {
  assert.equal(V.sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j');
  assert.equal(V.sanitizeFilename('../../etc/passwd'), '.._.._etc_passwd');
  assert.match(V.sanitizeFilename('CON'), /^video_/);
  assert.equal(V.sanitizeFilename('name. . '), 'name');
  assert.equal(V.sanitizeFilename('x'.repeat(500)).length, 150);
  assert.equal(V.sanitizeFilename(''), 'video_file');
});

test('isPathInside blocks traversal', () => {
  assert.equal(V.isPathInside('/a/b', '/a/b/c/d.mp4'), true);
  assert.equal(V.isPathInside('/a/b', '/a/b'), true);
  assert.equal(V.isPathInside('/a/b', '/a/b/../c'), false);
  assert.equal(V.isPathInside('/a/b', '/a/bc/file'), false);
  assert.equal(V.isPathInside('/a/b', '/etc/passwd'), false);
});

test('validateOutputDir rejects relative, root and system folders', () => {
  assert.equal(V.validateOutputDir('relative/path').ok, false);
  assert.equal(V.validateOutputDir('/').ok, false);
  assert.equal(V.validateOutputDir('/etc/videos').ok, false);
  assert.equal(V.validateOutputDir('/tmp/videos\0x').ok, false);
  assert.equal(V.validateOutputDir('/home/me/Videos').ok, true);
});

test('validateSettingsPatch validates every key', () => {
  assert.equal(V.validateSettingsPatch({ maxConcurrentDownloads: 0 }).ok, false);
  assert.equal(V.validateSettingsPatch({ maxConcurrentDownloads: 11 }).ok, false);
  assert.equal(V.validateSettingsPatch({ defaultFormat: 'avi' }).ok, false);
  assert.equal(V.validateSettingsPatch({ defaultQuality: '999' }).ok, false);
  assert.equal(V.validateSettingsPatch({ theme: 'pink' }).ok, false);
  assert.equal(V.validateSettingsPatch({ notificationsEnabled: 'yes' }).ok, false);
  assert.equal(V.validateSettingsPatch({ evil: 1 }).ok, false);
  assert.deepEqual(V.validateSettingsPatch({ theme: 'light', maxConcurrentDownloads: 2 }).value, { theme: 'light', maxConcurrentDownloads: 2 });
});

test('classifyYtDlpError gives friendly messages', () => {
  assert.equal(classifyYtDlpError('ERROR: Unsupported URL: x').code, 'UNSUPPORTED');
  assert.equal(classifyYtDlpError('ERROR: Private video. Sign in').code, 'AUTH_REQUIRED');
  assert.equal(classifyYtDlpError('ERROR: Video unavailable').code, 'UNAVAILABLE');
  assert.equal(classifyYtDlpError('Connection reset by peer').recoverable, true);
  assert.equal(classifyYtDlpError('[Errno 28] No space left on device').code, 'DISK_FULL');
  assert.equal(classifyYtDlpError('PermissionError: [Errno 13] Permission denied').code, 'PERMISSION');
  assert.equal(classifyYtDlpError('ERROR: ffmpeg not found').code, 'FFMPEG_MISSING');
  assert.equal(classifyYtDlpError('ERROR: this stream is DRM protected').code, 'DRM');
  assert.equal(classifyYtDlpError('weird').code, 'UNKNOWN');
});
