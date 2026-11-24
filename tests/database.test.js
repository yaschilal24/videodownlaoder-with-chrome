'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { openDatabase } = require('../desktop-app/backend/database/database');

const mk = () => openDatabase(':memory:', { defaultDownloadDir: '/tmp/dl' });

test('initialises schema, migrations and default settings', () => {
  const db = mk();
  assert.equal(db.schemaVersion, 2);
  assert.deepEqual(db.getSettings(), { downloadDirectory: '/tmp/dl', maxConcurrentDownloads: 3, defaultQuality: 'best',
    defaultFormat: 'mp4', theme: 'dark', notificationsEnabled: true, startWithWindows: false, autoOpenFolder: false });
  const idx = db.raw.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_downloads_%'").all().map((r) => r.name);
  assert.deepEqual(idx.sort(), ['idx_downloads_created', 'idx_downloads_status', 'idx_downloads_url']);
});

test('download CRUD and status filter', () => {
  const db = mk();
  const a = db.createDownload({ url: 'https://example.com/a' });
  const b = db.createDownload({ url: 'https://example.com/b', format: 'mp3', quality: '720' });
  assert.equal(a.status, 'pending'); assert.equal(b.format, 'mp3');
  db.updateDownload(a.id, { status: 'completed', progress: 100, title: 'T' });
  assert.equal(db.listDownloads({ status: 'completed' }).length, 1);
  assert.equal(db.listDownloads().length, 2);
  assert.equal(db.getDownload(a.id).title, 'T');
  assert.equal(db.deleteDownload(a.id), true);
  assert.equal(db.getDownload(a.id), undefined);
  assert.deepEqual(db.countByStatus(), { pending: 1 });
});

test('constraints reject invalid values', () => {
  const db = mk();
  const d = db.createDownload({ url: 'https://example.com/a' });
  assert.throws(() => db.raw.prepare("UPDATE downloads SET status='bogus' WHERE id=?").run(d.id), /CHECK/);
  assert.throws(() => db.raw.prepare('UPDATE downloads SET progress=150 WHERE id=?').run(d.id), /CHECK/);
  assert.throws(() => db.raw.prepare('UPDATE settings SET max_concurrent_downloads=99').run(), /CHECK/);
  assert.throws(() => db.raw.prepare("INSERT INTO settings (id, download_directory) VALUES (2, 'x')").run(), /CHECK/);
});

test('updateDownload ignores unknown columns (no SQL injection through keys)', () => {
  const db = mk();
  const d = db.createDownload({ url: 'https://example.com/a' });
  db.updateDownload(d.id, { 'title = 1; DROP TABLE downloads; --': 'x', title: 'ok' });
  assert.equal(db.getDownload(d.id).title, 'ok');
});

test('findActiveByUrl only matches unfinished downloads', () => {
  const db = mk();
  const a = db.createDownload({ url: 'https://example.com/a' });
  assert.equal(db.findActiveByUrl('https://example.com/a').id, a.id);
  assert.equal(db.findActiveByUrl('https://example.com/a', a.id), undefined);
  db.updateDownload(a.id, { status: 'completed' });
  assert.equal(db.findActiveByUrl('https://example.com/a'), undefined);
});

test('settings update and reset', () => {
  const db = mk();
  db.updateSettings({ theme: 'light', maxConcurrentDownloads: 5, notificationsEnabled: false });
  assert.deepEqual([db.getSettings().theme, db.getSettings().maxConcurrentDownloads, db.getSettings().notificationsEnabled], ['light', 5, false]);
  assert.equal(db.resetSettings().theme, 'dark');
});
