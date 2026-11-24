'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { startTestServer, TOKEN, EXT_ORIGIN } = require('./helpers');

let t;
test.before(async () => { t = await startTestServer(); });
test.after(() => t.close());

test('health is public and minimal', async () => {
  const r = await fetch(`${t.base}/api/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'ok', app: 'video-downloader-pro' });
});

test('protected routes reject missing/wrong token', async () => {
  assert.equal((await fetch(`${t.base}/api/downloads`)).status, 401);
  assert.equal((await fetch(`${t.base}/api/downloads`, { headers: { 'x-vdp-token': 'b'.repeat(64) } })).status, 401);
});

test('valid token is accepted', async () => {
  assert.equal((await t.call('GET', '/api/downloads')).status, 200);
});

test('foreign Origin is rejected, extension Origin allowed', async () => {
  assert.equal((await fetch(`${t.base}/api/health`, { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${t.base}/api/health`, { headers: { Origin: EXT_ORIGIN } })).status, 200);
});

test('wrong Host header is rejected (DNS rebinding)', async () => {
  const port = new URL(t.base).port;
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/health', headers: { Host: 'evil.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 403);
});

test('server only listens on loopback', () => {
  assert.ok(t.base.startsWith('http://127.0.0.1:'));
});
