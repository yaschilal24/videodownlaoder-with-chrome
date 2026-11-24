'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { startTestServer, SKIP_ENGINE } = require('./helpers');

let t;
test.before(async () => { t = await startTestServer(); });
test.after(() => t.close());

test('invalid URLs are rejected with 400 on every URL endpoint', async () => {
  for (const [m, p] of [['POST', '/api/download/receive'], ['POST', '/api/downloads'], ['POST', '/api/video/analyze']]) {
    for (const url of ['', 'nope', 'javascript:alert(1)', 'http://localhost:3000', undefined]) {
      const r = await t.call(m, p, { url });
      assert.equal(r.status, 400, `${p} ${url}`);
      assert.equal(r.json.code, 'INVALID_URL');
    }
  }
});

test('malformed JSON and bad ids give clean errors', async () => {
  assert.equal((await t.call('POST', '/api/download/receive', '{bad json')).status, 400);
  assert.equal((await t.call('GET', '/api/downloads/not-a-uuid')).status, 400);
  assert.equal((await t.call('GET', '/api/downloads/11111111-1111-4111-8111-111111111111')).status, 404);
  assert.equal((await t.call('POST', '/api/downloads/11111111-1111-4111-8111-111111111111/start', {})).status, 404);
  assert.equal((await t.call('GET', '/api/nope')).status, 404);
});

test('receive creates a pending task, notifies the UI, and de-duplicates', async () => {
  const r = await t.call('POST', '/api/download/receive', { url: 'https://example.com/watch/recv1', title: 'Page title' });
  assert.equal(r.status, 201);
  assert.equal(r.json.download.status, 'pending'); assert.equal(r.json.duplicate, false);
  assert.equal(t.calls.received.at(-1).download.id, r.json.download.id);
  const again = await t.call('POST', '/api/download/receive', { url: 'https://example.com/watch/recv1' });
  assert.equal(again.status, 200); assert.equal(again.json.duplicate, true);
  assert.equal(again.json.download.id, r.json.download.id);
});

test('list / get / delete', async () => {
  const c = await t.call('POST', '/api/downloads', { url: 'https://example.com/watch/crud1' });
  assert.equal(c.status, 201);
  assert.ok((await t.call('GET', '/api/downloads')).json.some((d) => d.id === c.json.id));
  assert.equal((await t.call('GET', `/api/downloads/${c.json.id}`)).json.url, 'https://example.com/watch/crud1');
  assert.equal((await t.call('GET', '/api/downloads?status=pending')).status, 200);
  assert.equal((await t.call('DELETE', `/api/downloads/${c.json.id}`)).status, 204);
  assert.equal((await t.call('GET', `/api/downloads/${c.json.id}`)).status, 404);
});

test('create validates format/quality', async () => {
  assert.equal((await t.call('POST', '/api/downloads', { url: 'https://example.com/v/f1', format: 'exe' })).status, 400);
  assert.equal((await t.call('POST', '/api/downloads', { url: 'https://example.com/v/f2', quality: '9999' })).status, 400);
});

test('settings: read, update, validation, path safety, reset', async () => {
  const g = await t.call('GET', '/api/settings');
  assert.equal(g.status, 200); assert.equal(g.json.theme, 'dark'); assert.ok('ytdlp' in g.json.tools && 'ffmpeg' in g.json.tools);
  const u = await t.call('PUT', '/api/settings', { theme: 'light', maxConcurrentDownloads: 2 });
  assert.equal(u.json.theme, 'light'); assert.equal(u.json.maxConcurrentDownloads, 2);
  assert.equal((await t.call('PUT', '/api/settings', { maxConcurrentDownloads: 50 })).status, 400);
  assert.equal((await t.call('PUT', '/api/settings', { downloadDirectory: 'relative' })).status, 400);
  assert.equal((await t.call('PUT', '/api/settings', { downloadDirectory: '/etc/evil' })).status, 400);
  assert.equal((await t.call('PUT', '/api/settings', { bogus: true })).status, 400);
  assert.equal((await t.call('POST', '/api/settings/reset')).json.theme, 'dark');
});

test('stats endpoint', async () => {
  const s = await t.call('GET', '/api/stats');
  assert.equal(s.status, 200);
  for (const k of ['active', 'completed', 'queued', 'extension']) assert.ok(k in s.json);
});

test('app focus endpoint calls the desktop callback', async () => {
  const before = t.calls.focus;
  assert.equal((await t.call('POST', '/api/app/focus')).status, 200);
  assert.equal(t.calls.focus, before + 1);
});

test('analyze returns formats, heights and metadata', { skip: SKIP_ENGINE }, async () => {
  const r = await t.call('POST', '/api/video/analyze', { url: 'https://example.com/watch/hello' });
  assert.equal(r.status, 200);
  assert.equal(r.json.title, 'Fake hello'); assert.deepEqual(r.json.heights, [1080, 720]);
  assert.equal(r.json.source, 'Fake'); assert.equal(r.json.duration, 62);
  assert.ok(r.json.formats.every((f) => f.ext !== 'mhtml'));
});

test('analyze error handling: unsupported and private videos', { skip: SKIP_ENGINE }, async () => {
  const a = await t.call('POST', '/api/video/analyze', { url: 'https://example.com/unsupported/x' });
  assert.equal(a.status, 422); assert.equal(a.json.code, 'UNSUPPORTED');
  const b = await t.call('POST', '/api/video/analyze', { url: 'https://example.com/private/x' });
  assert.equal(b.json.code, 'AUTH_REQUIRED'); assert.match(b.json.error, /does not bypass/);
});

test('missing yt-dlp gives a clear 503', { skip: SKIP_ENGINE }, async () => {
  const t2 = await startTestServer({ noYtdlp: true });
  try {
    const r = await t2.call('POST', '/api/video/analyze', { url: 'https://example.com/watch/x' });
    assert.equal(r.status, 503); assert.equal(r.json.code, 'YTDLP_MISSING');
    const s = await t2.call('GET', '/api/settings');
    assert.equal(s.json.tools.ytdlp.found, false);
  } finally { t2.close(); }
});
