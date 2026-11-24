'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Built-in SQLite (Node 22.13+/24 and Electron 35+): no native module, nothing to compile.
const { DatabaseSync } = require('node:sqlite');

const DB_DIR = __dirname;

const userVersion = (db) => db.prepare('PRAGMA user_version').get().user_version;

function inTransaction(db, fn) {
  db.exec('BEGIN');
  try { fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** Applies schema.sql (v1) then migrations/NNN_*.sql, tracked with PRAGMA user_version. */
function runMigrations(db) {
  let version = userVersion(db);
  if (version < 1) {
    inTransaction(db, () => {
      db.exec(fs.readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8'));
      db.exec('PRAGMA user_version = 1');
    });
    version = 1;
  }
  const dir = path.join(DB_DIR, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  for (const f of files) {
    const n = parseInt(f, 10);
    if (n <= version) continue;
    inTransaction(db, () => {
      db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      db.exec(`PRAGMA user_version = ${n}`);
    });
    version = n;
  }
  return version;
}

const DL_COLUMNS = {
  url: 'url', title: 'title', thumbnail: 'thumbnail', format: 'format', quality: 'quality',
  outputPath: 'output_path', status: 'status', progress: 'progress', speed: 'speed', fileSize: 'file_size',
  completedAt: 'completed_at', errorMessage: 'error_message', downloadedBytes: 'downloaded_bytes',
  eta: 'eta', source: 'source', duration: 'duration',
};
const SETTING_COLUMNS = {
  downloadDirectory: 'download_directory', maxConcurrentDownloads: 'max_concurrent_downloads',
  defaultQuality: 'default_quality', defaultFormat: 'default_format', theme: 'theme',
  notificationsEnabled: 'notifications_enabled', startWithWindows: 'start_with_windows', autoOpenFolder: 'auto_open_folder',
};
const BOOL_SETTINGS = new Set(['notificationsEnabled', 'startWithWindows', 'autoOpenFolder']);

const toDownload = (r) => r && ({
  id: r.id, url: r.url, title: r.title, thumbnail: r.thumbnail, format: r.format, quality: r.quality,
  outputPath: r.output_path, status: r.status, progress: r.progress, speed: r.speed, fileSize: r.file_size,
  downloadedBytes: r.downloaded_bytes, eta: r.eta, source: r.source, duration: r.duration,
  createdAt: r.created_at, completedAt: r.completed_at, errorMessage: r.error_message,
});
const toSettings = (r) => ({
  downloadDirectory: r.download_directory, maxConcurrentDownloads: r.max_concurrent_downloads,
  defaultQuality: r.default_quality, defaultFormat: r.default_format, theme: r.theme,
  notificationsEnabled: !!r.notifications_enabled, startWithWindows: !!r.start_with_windows, autoOpenFolder: !!r.auto_open_folder,
});

function openDatabase(dbPath, { defaultDownloadDir }) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  const schemaVersion = runMigrations(db);

  const defaults = () => ({
    id: 1, download_directory: defaultDownloadDir, max_concurrent_downloads: 3, default_quality: 'best',
    default_format: 'mp4', theme: 'dark', notifications_enabled: 1, start_with_windows: 0, auto_open_folder: 0,
  });
  const insertDefaults = () => {
    const d = defaults();
    db.prepare(`INSERT OR IGNORE INTO settings (id, download_directory, max_concurrent_downloads, default_quality, default_format,
      theme, notifications_enabled, start_with_windows, auto_open_folder)
      VALUES (@id,@download_directory,@max_concurrent_downloads,@default_quality,@default_format,@theme,@notifications_enabled,@start_with_windows,@auto_open_folder)`).run(d);
  };
  insertDefaults();

  const ACTIVE = ['pending', 'analyzing', 'downloading', 'paused'];

  return {
    schemaVersion,
    raw: db,

    createDownload({ url, format = 'mp4', quality = 'best', title = null }) {
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO downloads (id, url, title, format, quality, status, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, url, title, format, quality, 'pending', new Date().toISOString());
      return this.getDownload(id);
    },
    getDownload: (id) => toDownload(db.prepare('SELECT * FROM downloads WHERE id = ?').get(id)),
    listDownloads({ status, limit = 500 } = {}) {
      const rows = status
        ? db.prepare('SELECT * FROM downloads WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit)
        : db.prepare('SELECT * FROM downloads ORDER BY created_at DESC LIMIT ?').all(limit);
      return rows.map(toDownload);
    },
    /** Updates whitelisted columns only (column names never come from user input). */
    updateDownload(id, patch) {
      const keys = Object.keys(patch).filter((k) => k in DL_COLUMNS);
      if (!keys.length) return this.getDownload(id);
      const sql = `UPDATE downloads SET ${keys.map((k) => `${DL_COLUMNS[k]} = @${k}`).join(', ')} WHERE id = @id`;
      db.prepare(sql).run({ ...Object.fromEntries(keys.map((k) => [k, patch[k]])), id });
      return this.getDownload(id);
    },
    deleteDownload: (id) => db.prepare('DELETE FROM downloads WHERE id = ?').run(id).changes > 0,
    findActiveByUrl(url, exceptId = null) {
      const row = db.prepare(`SELECT * FROM downloads WHERE url = ? AND status IN (${ACTIVE.map(() => '?').join(',')}) AND id IS NOT ? LIMIT 1`)
        .get(url, ...ACTIVE, exceptId);
      return toDownload(row);
    },
    countByStatus() {
      const out = {};
      for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM downloads GROUP BY status').all()) out[r.status] = r.n;
      return out;
    },

    getSettings: () => toSettings(db.prepare('SELECT * FROM settings WHERE id = 1').get()),
    updateSettings(patch) {
      const keys = Object.keys(patch).filter((k) => k in SETTING_COLUMNS);
      if (keys.length) {
        const params = {};
        for (const k of keys) params[k] = BOOL_SETTINGS.has(k) ? (patch[k] ? 1 : 0) : patch[k];
        db.prepare(`UPDATE settings SET ${keys.map((k) => `${SETTING_COLUMNS[k]} = @${k}`).join(', ')} WHERE id = 1`).run(params);
      }
      return this.getSettings();
    },
    resetSettings() { db.prepare('DELETE FROM settings').run(); insertDefaults(); return this.getSettings(); },

    close: () => db.close(),
  };
}

module.exports = { openDatabase };
