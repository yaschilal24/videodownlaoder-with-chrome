'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { startTestServer, waitStatus, TOKEN, EXT_ORIGIN, SKIP_ENGINE } = require('./helpers');

const extCall = (t, method, p, body, token) =>
  t.call(method, p, body, { Origin: EXT_ORIGIN, 'x-vdp-token': token ?? '' });

test('pairing: code -> token, single use, wrong codes rejected', async () => {
  const t = await startTestServer();
  try {
    const { code } = t.srv.createPairingCode();
    assert.match(code, /^\d{6}$/);
    assert.equal((await t.call('POST', '/api/pair', { code }, { Origin: 'null' })).status, 403, 'only extension origin may pair');
    assert.equal((await t.call('POST', '/api/pair', { code })).status, 403, 'no origin');
    const wrong = await extCall(t, 'POST', '/api/pair', { code: code === '000000' ? '111111' : '000000' });
    assert.equal(wrong.status, 401);
    const ok = await extCall(t, 'POST', '/api/pair', { code });
    assert.equal(ok.status, 200); assert.equal(ok.json.token, TOKEN);
    assert.equal((await extCall(t, 'POST', '/api/pair', { code })).status, 401, 'code is single-use');
  } finally { t.close(); }
});

test('pairing: brute force is rate limited', async () => {
  const t = await startTestServer();
  try {
    t.srv.createPairingCode();
    let last;
    for (let i = 0; i < 6; i++) last = await extCall(t, 'POST', '/api/pair', { code: '999999' });
    assert.equal(last.status, 429);
  } finally { t.close(); }
});

test('extension must present the token for every other endpoint', async () => {
  const t = await startTestServer();
  try {
    assert.equal((await extCall(t, 'POST', '/api/download/receive', { url: 'https://example.com/v/1' }, '')).status, 401);
    assert.equal((await extCall(t, 'GET', '/api/ping', undefined, 'b'.repeat(64))).status, 401);
    assert.equal((await extCall(t, 'GET', '/api/ping', undefined, TOKEN)).status, 200);
  } finally { t.close(); }
});

test('extension connection status shows up in stats', async () => {
  const t = await startTestServer();
  try {
    assert.equal((await t.call('GET', '/api/stats')).json.extension.connected, false);
    await extCall(t, 'GET', '/api/ping', undefined, TOKEN);
    assert.equal((await t.call('GET', '/api/stats')).json.extension.connected, true);
  } finally { t.close(); }
});

test('CORS preflight from the extension works, from other sites is refused', async () => {
  const t = await startTestServer();
  try {
    const ok = await fetch(`${t.base}/api/download/receive`, { method: 'OPTIONS', headers: { Origin: EXT_ORIGIN } });
    assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), EXT_ORIGIN);
    const bad = await fetch(`${t.base}/api/download/receive`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(bad.status, 403);
  } finally { t.close(); }
});

test('extension manifest is valid MV3 and only talks to the loopback port', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'chrome-extension', 'manifest.json'), 'utf8'));
  const { BACKEND_PORT } = require('../shared/constants');
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.host_permissions, [`http://127.0.0.1:${BACKEND_PORT}/*`]);
  for (const p of ['activeTab', 'scripting', 'storage', 'alarms']) assert.ok(m.permissions.includes(p), p);
  for (const f of [m.background.service_worker, m.action.default_popup, ...Object.values(m.icons)]) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'chrome-extension', f)), `${f} exists`);
  }
  const cfg = fs.readFileSync(path.join(__dirname, '..', 'chrome-extension', 'config.js'), 'utf8');
  assert.ok(cfg.includes(String(BACKEND_PORT)), 'extension port matches shared constants');
});

test('FULL WORKFLOW: Extension -> Receiver -> Analyzer -> Queue -> yt-dlp -> saved file', { skip: SKIP_ENGINE }, async () => {
  const t = await startTestServer();
  try {
    // 1. pair
    const { code } = t.srv.createPairingCode();
    const token = (await extCall(t, 'POST', '/api/pair', { code })).json.token;
    // 2. extension sends the current tab URL
    const pageUrl = 'https://example.com/watch/e2e-video';
    const rec = await extCall(t, 'POST', '/api/download/receive', { url: pageUrl, title: 'Tab title' }, token);
    assert.equal(rec.status, 201);
    assert.equal(t.calls.received.length, 1, 'desktop UI was notified');
    // 3. desktop analyzes the URL
    const info = (await t.call('POST', '/api/video/analyze', { url: pageUrl })).json;
    assert.deepEqual(info.heights, [1080, 720]);
    // 4. user picks a quality and starts the existing task
    const id = rec.json.download.id;
    assert.equal((await t.call('POST', `/api/downloads/${id}/start`, { format: 'mp4', quality: '720' })).status, 200);
    // 5. download engine finishes and the file exists
    const done = await waitStatus(t, id, 'completed');
    assert.equal(done.quality, '720'); assert.ok(fs.existsSync(done.outputPath));
    assert.equal((await t.call('GET', '/api/stats')).json.completed, 1);
  } finally { t.close(); }
});
