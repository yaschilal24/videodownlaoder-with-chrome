'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { startTestServer, waitFor, waitStatus, SKIP_ENGINE } = require('./helpers');
const { AppError } = require('../desktop-app/backend/utils/errors');

const opts = { skip: SKIP_ENGINE };
const start = (t, slug, extra = {}) => t.call('POST', '/api/downloads', { url: `https://example.com/watch/${slug}`, startNow: true, ...extra });

test('full download: analyze -> download -> saved file, with real progress events and status changes', opts, async () => {
  const t = await startTestServer();
  try {
    const statuses = [], progress = [];
    t.srv.queue.on('status', (e) => statuses.push(e.status));
    t.srv.queue.on('progress', (e) => progress.push(e.progress));
    const c = await start(t, 'hello', { format: 'mp4', quality: '720' });
    assert.equal(c.status, 201);
    const done = await waitStatus(t, c.json.id, 'completed');
    assert.equal(done.title, 'Fake hello'); assert.equal(done.progress, 100); assert.ok(done.completedAt);
    assert.ok(fs.existsSync(done.outputPath), 'file saved'); assert.ok(done.outputPath.startsWith(t.dlDir));
    assert.equal(done.fileSize, 4096);
    assert.ok(statuses.includes('analyzing') && statuses.includes('downloading') && statuses.at(-1) === 'completed', statuses.join(','));
    assert.ok(progress.length >= 1, 'progress events emitted');
    assert.deepEqual([...progress].sort((a, b) => a - b), progress, 'progress never goes backwards');
    assert.equal(fs.existsSync(done.outputPath + '.part'), false);
  } finally { t.close(); }
});

test('duplicate active downloads are prevented', opts, async () => {
  const t = await startTestServer();
  try {
    const c = await start(t, 'slow-dup');
    const d = await t.call('POST', '/api/downloads', { url: 'https://example.com/watch/slow-dup' });
    assert.equal(d.status, 409); assert.equal(d.json.code, 'DUPLICATE');
    assert.equal((await t.call('POST', `/api/downloads/${c.json.id}/start`, {})).status, 409);
    await t.call('POST', `/api/downloads/${c.json.id}/cancel`);
    await waitStatus(t, c.json.id, 'cancelled');
  } finally { t.close(); }
});

test('pause then resume completes the download', opts, async () => {
  const t = await startTestServer();
  try {
    const c = await start(t, 'slow-pause');
    await waitFor(async () => (await t.call('GET', `/api/downloads/${c.json.id}`)).json.status === 'downloading', { what: 'downloading' });
    assert.equal((await t.call('POST', `/api/downloads/${c.json.id}/resume`)).status, 409, 'cannot resume a running task');
    assert.equal((await t.call('POST', `/api/downloads/${c.json.id}/pause`)).status, 200);
    const paused = await waitStatus(t, c.json.id, 'paused');
    assert.equal(paused.speed, 0);
    assert.equal((await t.call('POST', `/api/downloads/${c.json.id}/resume`)).status, 200);
    const done = await waitStatus(t, c.json.id, 'completed');
    assert.ok(fs.existsSync(done.outputPath));
  } finally { t.close(); }
});

test('cancel stops the process and removes partial files', opts, async () => {
  const t = await startTestServer();
  try {
    const c = await start(t, 'slow-cancel');
    await waitFor(async () => (await t.call('GET', `/api/downloads/${c.json.id}`)).json.outputPath, { what: 'output path' });
    assert.equal((await t.call('POST', `/api/downloads/${c.json.id}/cancel`)).status, 200);
    const d = await waitStatus(t, c.json.id, 'cancelled');
    assert.deepEqual(fs.readdirSync(t.dlDir).filter((f) => /\.part$/.test(f)), []);
    assert.equal((await t.call('POST', `/api/downloads/${d.id}/cancel`)).status, 409);
    // a cancelled download can be retried
    assert.equal((await t.call('POST', `/api/downloads/${d.id}/start`, {})).status, 200);
    await waitStatus(t, d.id, 'completed');
  } finally { t.close(); }
});

test('recoverable network errors are retried automatically', opts, async () => {
  const t = await startTestServer();
  try {
    const states = [];
    t.srv.queue.on('status', (e) => e.download && e.download.errorMessage && states.push(e.download.errorMessage));
    const c = await start(t, 'netfail1');
    const done = await waitStatus(t, c.json.id, 'completed');
    assert.equal(done.errorMessage, null);
    assert.ok(states.some((m) => /retrying \(1\/3\)/.test(m)), 'announced retry');
  } finally { t.close(); }
});

test('persistent network failure ends as failed with a friendly message, then can be retried', opts, async () => {
  const t = await startTestServer();
  try {
    const c = await start(t, 'alwaysnet1');
    const f = await waitStatus(t, c.json.id, 'failed');
    assert.match(f.errorMessage, /connection was interrupted/i);
    assert.equal((await t.call('POST', `/api/downloads/${c.json.id}/start`, {})).status, 200);
  } finally { t.close(); }
});

test('non-recoverable errors fail immediately with the access-control message', opts, async () => {
  const t = await startTestServer();
  try {
    const c = await start(t, 'private-1');
    const f = await waitStatus(t, c.json.id, 'failed');
    assert.match(f.errorMessage, /does not bypass access restrictions/);
  } finally { t.close(); }
});

test('concurrency limit is respected', opts, async () => {
  const t = await startTestServer();
  try {
    await t.call('PUT', '/api/settings', { maxConcurrentDownloads: 1 });
    let maxActive = 0;
    const poll = setInterval(() => {
      const n = [...t.srv.queue.running.keys()].length;
      if (n > maxActive) maxActive = n;
    }, 5);
    const a = await start(t, 'slow-a'); const b = await start(t, 'slow-b');
    await waitStatus(t, a.json.id, 'completed'); await waitStatus(t, b.json.id, 'completed');
    clearInterval(poll);
    assert.equal(maxActive, 1);
  } finally { t.close(); }
});

test('insufficient disk space is reported clearly', opts, async () => {
  const t = await startTestServer();
  try {
    t.srv.files.assertFreeSpace = async () => { throw new AppError('DISK_FULL', 'There is not enough free disk space. Free some space or choose another folder.', 422); };
    const c = await start(t, 'nodisk1');
    const f = await waitStatus(t, c.json.id, 'failed');
    assert.match(f.errorMessage, /not enough free disk space/);
  } finally { t.close(); }
});

test('missing yt-dlp makes a started download fail with an actionable message', opts, async () => {
  const t = await startTestServer({ noYtdlp: true });
  try {
    const c = await t.call('POST', '/api/downloads', { url: 'https://example.com/watch/x1', title: 'Known', startNow: true });
    const f = await waitStatus(t, c.json.id, 'failed');
    assert.match(f.errorMessage, /yt-dlp\) is missing/);
  } finally { t.close(); }
});

test('delete while downloading cancels the job first', opts, async () => {
  const t = await startTestServer();
  try {
    const c = await start(t, 'slow-del');
    await waitFor(async () => (await t.call('GET', `/api/downloads/${c.json.id}`)).json.status === 'downloading', { what: 'downloading' });
    assert.equal((await t.call('DELETE', `/api/downloads/${c.json.id}`)).status, 204);
    assert.equal((await t.call('GET', `/api/downloads/${c.json.id}`)).status, 404);
  } finally { t.close(); }
});

test('restart recovery: interrupted tasks become paused and are never auto-restarted', opts, async () => {
  const t = await startTestServer();
  const stuck = t.srv.repo.createDownload({ url: 'https://example.com/watch/stuck1', title: 'Stuck' });
  t.srv.repo.updateDownload(stuck.id, { status: 'downloading', progress: 42 });
  const analyzing = t.srv.repo.createDownload({ url: 'https://example.com/watch/stuck2' });
  t.srv.repo.updateDownload(analyzing.id, { status: 'analyzing' });
  const finished = t.srv.repo.createDownload({ url: 'https://example.com/watch/done1' });
  t.srv.repo.updateDownload(finished.id, { status: 'completed', progress: 100 });
  const pending = t.srv.repo.createDownload({ url: 'https://example.com/watch/pend1' });
  t.close(); // simulates the app being closed

  const t2 = await startTestServer({ tmp: t.tmp });
  try {
    const get = async (id) => (await t2.call('GET', `/api/downloads/${id}`)).json;
    const s = await get(stuck.id);
    assert.equal(s.status, 'paused'); assert.equal(s.progress, 42); assert.match(s.errorMessage, /Interrupted/);
    assert.equal((await get(analyzing.id)).status, 'paused');
    assert.equal((await get(finished.id)).status, 'completed');
    assert.equal((await get(pending.id)).status, 'pending');
    assert.equal(t2.srv.queue.running.size, 0, 'nothing restarted automatically');
    // user can resume explicitly
    assert.equal((await t2.call('POST', `/api/downloads/${stuck.id}/resume`)).status, 200);
    await waitStatus(t2, stuck.id, 'completed');
  } finally { t2.close(); }
});

test('shutdown while downloading leaves a resumable paused record', opts, async () => {
  const t = await startTestServer();
  const c = await start(t, 'slow-shutdown');
  await waitFor(async () => (await t.call('GET', `/api/downloads/${c.json.id}`)).json.status === 'downloading', { what: 'downloading' });
  t.srv.queue.shutdown();
  const row = t.srv.repo.getDownload(c.json.id);
  assert.equal(row.status, 'paused');
  await new Promise((r) => setTimeout(r, 300));
  t.close();
});
