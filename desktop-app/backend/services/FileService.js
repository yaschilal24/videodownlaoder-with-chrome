'use strict';
const fs = require('fs');
const path = require('path');
const { shell } = (() => { try { return require('electron'); } catch { return {}; } })();
const { AppError } = require('../utils/errors');
const { validateOutputDir, isPathInside } = require('../utils/validators');

const MIN_FREE_BYTES = 200 * 1024 * 1024;
const PARTIAL_EXT = /\.(part|ytdl|temp|tmp)$|\.part-Frag\d+$/i;

class FileService {
  /** Validates, creates and write-tests the download directory. Returns the resolved path. */
  async ensureDir(dir) {
    const v = validateOutputDir(dir);
    if (!v.ok) throw new AppError('INVALID_PATH', v.error, 400);
    try {
      await fs.promises.mkdir(v.dir, { recursive: true });
      await fs.promises.access(v.dir, fs.constants.W_OK);
    } catch (e) {
      if (e.code === 'EACCES' || e.code === 'EPERM') throw new AppError('PERMISSION', 'The app is not allowed to write to the download folder. Choose a different folder in Settings.', 422);
      throw new AppError('INVALID_PATH', 'The download folder could not be created. Choose another folder.', 422);
    }
    return v.dir;
  }

  /** Free/total bytes on the volume holding `dir` (walks up to the nearest existing parent). */
  async getDiskSpace(dir) {
    let probe = path.resolve(dir);
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
    const s = await fs.promises.statfs(probe);
    return { free: Number(s.bavail) * Number(s.bsize), total: Number(s.blocks) * Number(s.bsize) };
  }

  async assertFreeSpace(dir, needed = MIN_FREE_BYTES) {
    const { free } = await this.getDiskSpace(dir);
    if (free < Math.max(needed, MIN_FREE_BYTES)) {
      throw new AppError('DISK_FULL', 'There is not enough free disk space. Free some space or choose another folder.', 422);
    }
  }

  async fileSize(p) {
    try { return (await fs.promises.stat(p)).size; } catch { return null; }
  }

  /** Deletes yt-dlp partial files belonging to `outputPath` (never anything outside `dir`). */
  async cleanupPartials(outputPath, dir) {
    if (!outputPath || !dir) return;
    const parent = path.dirname(outputPath);
    if (!isPathInside(dir, parent)) return;
    const stem = path.basename(outputPath, path.extname(outputPath));
    let names = [];
    try { names = await fs.promises.readdir(parent); } catch { return; }
    for (const n of names) {
      if (n.startsWith(stem) && PARTIAL_EXT.test(n)) {
        await fs.promises.rm(path.join(parent, n), { force: true }).catch(() => {});
      }
    }
  }

  async open(p) { if (shell) return shell.openPath(p); }
}

module.exports = { FileService, MIN_FREE_BYTES };
