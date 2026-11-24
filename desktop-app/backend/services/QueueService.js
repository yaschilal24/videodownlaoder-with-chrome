'use strict';
const { EventEmitter } = require('events');
const { AppError } = require('../utils/errors');
const { FORMATS, QUALITIES } = require('../utils/validators');

const ACTIVE_STATES = ['pending', 'analyzing', 'downloading', 'paused'];
const MAX_RETRIES = 3;

/**
 * Owns download state transitions, concurrency, retries and restart recovery.
 * Emits: 'progress' ({id, progress, speed, downloadedBytes, fileSize, eta}) and 'status' ({id, status, download}).
 */
class QueueService extends EventEmitter {
  constructor({ repo, downloadService, videoInfoService, files, logger, retryBaseMs = 2000 }) {
    super();
    Object.assign(this, { repo, engine: downloadService, info: videoInfoService, files, log: logger, retryBaseMs });
    this.waiting = [];          // ids queued for a free slot
    this.running = new Map();   // id -> { handle, stopReason, attempt }
    this.timers = new Set();
    this.closed = false;        // set by shutdown(): late async work must not touch a closed database
  }

  /**
   * Startup recovery: tasks that were mid-flight when the app closed are NOT restarted automatically.
   * They become "paused" so the user decides (yt-dlp resumes from its .part file on Resume).
   */
  init() {
    let recovered = 0;
    for (const d of this.repo.listDownloads()) {
      if (d.status === 'downloading' || d.status === 'analyzing') {
        this.repo.updateDownload(d.id, { status: 'paused', speed: 0, eta: null,
          errorMessage: 'Interrupted when the app closed. Press Resume to continue.' });
        recovered++;
      }
    }
    if (recovered) this.log.info(`Recovered ${recovered} interrupted download(s) as paused`);
    return recovered;
  }

  get(id) {
    const d = this.repo.getDownload(id);
    if (!d) throw new AppError('NOT_FOUND', 'That download no longer exists.', 404);
    return d;
  }

  isQueuedOrRunning(id) { return this.waiting.includes(id) || this.running.has(id); }

  #setStatus(id, patch) {
    if (this.closed) return this.repo.getDownload?.(id) ?? null;
    const download = this.repo.updateDownload(id, patch);
    this.emit('status', { id, status: download.status, download });
    return download;
  }

  #applySelection(id, sel = {}) {
    const patch = {};
    if (sel.format !== undefined) { if (!FORMATS.includes(sel.format)) throw new AppError('VALIDATION', 'Unknown format.', 400); patch.format = sel.format; }
    if (sel.quality !== undefined) { if (!QUALITIES.includes(sel.quality)) throw new AppError('VALIDATION', 'Unknown quality.', 400); patch.quality = sel.quality; }
    if (Object.keys(patch).length) this.repo.updateDownload(id, patch);
  }

  /** Start (or retry) a pending/failed/cancelled task. */
  start(id, selection) {
    const d = this.get(id);
    if (!['pending', 'failed', 'cancelled'].includes(d.status) || this.isQueuedOrRunning(id)) {
      throw new AppError('INVALID_STATE', `This download is already ${d.status}.`, 409);
    }
    return this.#enqueue(id, selection, true);
  }

  resume(id) {
    const d = this.get(id);
    if (d.status !== 'paused' || this.isQueuedOrRunning(id)) throw new AppError('INVALID_STATE', 'Only paused downloads can be resumed.', 409);
    return this.#enqueue(id, undefined, false);
  }

  #enqueue(id, selection, fresh) {
    const d = this.get(id);
    const dup = this.repo.findActiveByUrl(d.url, id);
    if (dup && (this.isQueuedOrRunning(dup.id) || dup.status === 'paused')) {
      throw new AppError('DUPLICATE', 'This video is already in your downloads.', 409);
    }
    this.#applySelection(id, selection);
    const reset = fresh ? { progress: 0, speed: 0, downloadedBytes: 0, eta: null, completedAt: null } : {};
    const out = this.#setStatus(id, { status: 'pending', errorMessage: null, ...reset });
    this.waiting.push(id);
    setImmediate(() => this.pump());
    return out;
  }

  pump() {
    if (this.closed) return;
    const max = this.repo.getSettings().maxConcurrentDownloads;
    while (this.waiting.length && this.running.size < max) {
      const id = this.waiting.shift();
      this.running.set(id, { handle: null, stopReason: null, attempt: 0 });
      this.#run(id).catch((e) => this.log.error(`Job ${id} crashed`, e));
    }
  }

  async #run(id) {
    const job = this.running.get(id);
    try {
      if (this.closed) return;
      const settings = this.repo.getSettings();
      let d = this.get(id);

      // Fetch title/thumbnail first when we do not have them (e.g. URL received from Chrome).
      if (!d.title) {
        this.#setStatus(id, { status: 'analyzing' });
        try {
          const meta = await this.info.analyze(d.url);
          if (job.stopReason) return this.#finishStopped(id, job);
          d = this.#setStatus(id, { title: meta.title, thumbnail: meta.thumbnail, source: meta.source, duration: meta.duration, status: 'analyzing' });
        } catch (e) { return this.#fail(id, e); }
      }

      const dir = await this.files.ensureDir(settings.downloadDirectory);
      await this.files.assertFreeSpace(dir);
      this.#setStatus(id, { status: 'downloading', errorMessage: null });
      await this.#attempt(id, job, dir);
    } catch (e) {
      this.#fail(id, e);
    } finally {
      this.running.delete(id);
      if (!this.closed) setImmediate(() => this.pump());
    }
  }

  async #attempt(id, job, dir) {
    let lastEmit = 0, lastWrite = 0;
    const d = this.get(id);
    job.handle = this.engine.start(d, dir, {
      onFile: (p) => { if (!this.closed) this.repo.updateDownload(id, { outputPath: p }); },
      onProgress: (p) => {
        if (this.closed) return;
        const now = Date.now();
        const progress = Math.min(99.9, Math.max(this.repo.getDownload(id)?.progress ?? 0, p.percent ?? 0));
        const patch = { progress, speed: p.speed, downloadedBytes: Math.round(p.downloadedBytes), eta: p.eta == null ? null : Math.round(p.eta),
          ...(p.totalBytes ? { fileSize: Math.round(p.totalBytes) } : {}) };
        if (now - lastWrite > 1000) { this.repo.updateDownload(id, patch); lastWrite = now; }
        if (now - lastEmit > 250) {
          lastEmit = now;
          this.emit('progress', { id, progress, speed: p.speed, downloadedBytes: patch.downloadedBytes, fileSize: patch.fileSize ?? null, eta: patch.eta });
        }
      },
    });
    const res = await job.handle.done;

    if (job.stopReason) return this.#finishStopped(id, job);
    if (res.code === 0) {
      const finalPath = res.filePath || this.get(id).outputPath;
      const size = finalPath ? await this.files.fileSize(finalPath) : null;
      const out = this.#setStatus(id, { status: 'completed', progress: 100, speed: 0, eta: null, outputPath: finalPath,
        fileSize: size ?? this.get(id).fileSize, downloadedBytes: size ?? this.get(id).downloadedBytes,
        completedAt: new Date().toISOString(), errorMessage: null });
      return out;
    }
    const err = res.error;
    if (err.recoverable && job.attempt < MAX_RETRIES) {
      job.attempt += 1;
      this.#setStatus(id, { status: 'downloading', speed: 0, errorMessage: `Connection problem – retrying (${job.attempt}/${MAX_RETRIES})…` });
      await new Promise((r) => { const t = setTimeout(() => { this.timers.delete(t); r(); }, this.retryBaseMs * 2 ** (job.attempt - 1)); this.timers.add(t); job.wake = () => { clearTimeout(t); r(); }; });
      if (job.stopReason) return this.#finishStopped(id, job);
      return this.#attempt(id, job, dir);
    }
    throw err;
  }

  async #finishStopped(id, job) {
    if (this.closed) return;
    const dir = this.repo.getSettings().downloadDirectory;
    if (job.stopReason === 'cancel') {
      await this.files.cleanupPartials(this.get(id).outputPath, dir);
      this.#setStatus(id, { status: 'cancelled', speed: 0, eta: null, errorMessage: null });
    } else if (job.stopReason === 'pause') {
      this.#setStatus(id, { status: 'paused', speed: 0, eta: null, errorMessage: null });
    } else if (job.stopReason === 'shutdown') {
      this.repo.updateDownload(id, { status: 'paused', speed: 0, eta: null, errorMessage: 'Interrupted when the app closed. Press Resume to continue.' });
    }
  }

  #fail(id, e) {
    if (this.closed) return;
    const err = e instanceof AppError ? e : new AppError('UNKNOWN', `Unexpected error: ${e.message}`, 500);
    this.log.warn(`Download ${id} failed: ${err.code}`);
    if (!this.repo.getDownload(id)) return;
    this.#setStatus(id, { status: 'failed', speed: 0, eta: null, errorMessage: err.message });
  }

  pause(id) {
    const d = this.get(id);
    const job = this.running.get(id);
    if (job && d.status === 'downloading') {
      job.stopReason = 'pause'; job.handle?.stop(); job.wake?.();
      return d;
    }
    if (this.waiting.includes(id)) {
      this.waiting = this.waiting.filter((x) => x !== id);
      return this.#setStatus(id, { status: 'paused', errorMessage: null });
    }
    throw new AppError('INVALID_STATE', 'Only a running download can be paused.', 409);
  }

  async cancel(id) {
    const d = this.get(id);
    if (['completed', 'cancelled'].includes(d.status)) throw new AppError('INVALID_STATE', `This download is already ${d.status}.`, 409);
    const job = this.running.get(id);
    if (job) { job.stopReason = 'cancel'; job.handle?.stop(); job.wake?.(); return d; }
    this.waiting = this.waiting.filter((x) => x !== id);
    await this.files.cleanupPartials(d.outputPath, this.repo.getSettings().downloadDirectory);
    return this.#setStatus(id, { status: 'cancelled', speed: 0, eta: null, errorMessage: null });
  }

  async remove(id) {
    this.get(id);
    if (this.running.has(id)) { this.running.get(id).stopReason = 'cancel'; this.running.get(id).handle?.stop(); await this.#waitIdle(id); }
    this.waiting = this.waiting.filter((x) => x !== id);
    this.repo.deleteDownload(id);
    this.emit('status', { id, status: 'removed', download: null });
  }

  async #waitIdle(id) { for (let i = 0; i < 100 && this.running.has(id); i++) await new Promise((r) => setTimeout(r, 50)); }

  /** Called on app quit: stop every child process and persist a resumable state. */
  shutdown() {
    for (const t of this.timers) clearTimeout(t);
    for (const [id, job] of this.running) { job.stopReason = 'shutdown'; job.handle?.stop(); job.wake?.(); }
    for (const id of this.waiting) this.repo.updateDownload(id, { status: 'pending' });
    this.waiting = [];
    for (const [id] of this.running) this.repo.updateDownload(id, { status: 'paused', speed: 0, eta: null, errorMessage: 'Interrupted when the app closed. Press Resume to continue.' });
    this.closed = true;
  }

  async idle() { while (this.running.size || this.waiting.length) await new Promise((r) => setTimeout(r, 25)); }
}

module.exports = { QueueService, ACTIVE_STATES };
