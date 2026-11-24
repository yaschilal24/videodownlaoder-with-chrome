'use strict';
const { AppError } = require('../utils/errors');
const { FORMATS, QUALITIES } = require('../utils/validators');

function createDownloadController({ repo, queue, onUrlReceived }) {
  const pickSelection = (body = {}) => {
    const sel = {};
    if (body.format !== undefined) sel.format = body.format;
    if (body.quality !== undefined) sel.quality = body.quality;
    return sel;
  };

  return {
    /** From the Chrome extension: create a pending task (no download yet) and tell the UI. */
    async receive(req, res) {
      const existing = repo.findActiveByUrl(req.validUrl);
      if (existing) return res.status(200).json({ download: existing, duplicate: true });
      const s = repo.getSettings();
      const title = typeof req.body.title === 'string' ? req.body.title.slice(0, 300) : null;
      const download = repo.createDownload({ url: req.validUrl, format: s.defaultFormat, quality: s.defaultQuality, title: null });
      queue.emit('status', { id: download.id, status: download.status, download });
      onUrlReceived && onUrlReceived({ download, pageTitle: title });
      res.status(201).json({ download, duplicate: false });
    },

    async create(req, res) {
      const dup = repo.findActiveByUrl(req.validUrl);
      if (dup) throw new AppError('DUPLICATE', 'This video is already in your downloads.', 409);
      const s = repo.getSettings();
      const sel = pickSelection(req.body);
      if (sel.format !== undefined && !FORMATS.includes(sel.format)) throw new AppError('VALIDATION', 'Unknown format.', 400);
      if (sel.quality !== undefined && !QUALITIES.includes(sel.quality)) throw new AppError('VALIDATION', 'Unknown quality.', 400);
      const title = typeof req.body.title === 'string' ? req.body.title.slice(0, 300) : null;
      const download = repo.createDownload({ url: req.validUrl, format: sel.format || s.defaultFormat, quality: sel.quality || s.defaultQuality, title });
      if (req.body.thumbnail && typeof req.body.thumbnail === 'string' && /^https?:\/\//.test(req.body.thumbnail)) {
        repo.updateDownload(download.id, { thumbnail: req.body.thumbnail.slice(0, 2048) });
      }
      queue.emit('status', { id: download.id, status: 'pending', download });
      const out = req.body.startNow ? queue.start(download.id) : download;
      res.status(201).json(out);
    },

    list: (req, res) => res.json(repo.listDownloads({ status: typeof req.query.status === 'string' ? req.query.status : undefined })),
    get: (req, res) => res.json(queue.get(req.params.id)),
    start: (req, res) => res.json(queue.start(req.params.id, pickSelection(req.body))),
    pause: (req, res) => res.json(queue.pause(req.params.id)),
    resume: (req, res) => res.json(queue.resume(req.params.id)),
    async cancel(req, res) { res.json(await queue.cancel(req.params.id)); },
    async remove(req, res) { await queue.remove(req.params.id); res.status(204).end(); },
  };
}

module.exports = { createDownloadController };
