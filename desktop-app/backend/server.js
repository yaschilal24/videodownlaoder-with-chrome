'use strict';
const os = require('os');
const path = require('path');
const express = require('express');
const { hostGuard, originGuard, tokenAuth, createPairing, EXT_ORIGIN } = require('./middleware/security');
const { openDatabase } = require('./database/database');
const { createLogger } = require('./utils/logger');
const { AppError } = require('./utils/errors');
const { FFmpegService } = require('./services/FFmpegService');
const { FileService } = require('./services/FileService');
const { VideoInfoService } = require('./services/VideoInfoService');
const { DownloadService } = require('./services/DownloadService');
const { QueueService } = require('./services/QueueService');
const { createDownloadController } = require('./controllers/downloadController');
const { createVideoController } = require('./controllers/videoController');
const { downloadRoutes } = require('./routes/downloadRoutes');
const { videoRoutes } = require('./routes/videoRoutes');
const { settingsRoutes } = require('./routes/settingsRoutes');
const { wrap } = require('./middleware/validation');

/** Builds services, mounts the REST API and starts listening on loopback only. */
async function startServer(opts) {
  const {
    host = '127.0.0.1', port, token, authHeader = 'x-vdp-token', devOrigin = null, userDataPath,
    defaultDownloadDir = path.join(os.homedir(), 'Downloads', 'VideoDownloaderPro'), binDir = null,
    dbPath = path.join(userDataPath, 'downloads.db'), onUrlReceived, onFocus, onSettingsChanged, retryBaseMs,
  } = opts;

  const logger = createLogger(path.join(userDataPath, 'logs'));
  const repo = openDatabase(dbPath, { defaultDownloadDir });
  const files = new FileService();
  const ffmpegService = new FFmpegService({ binDir });
  const videoInfoService = new VideoInfoService({ ffmpegService });
  const downloadService = new DownloadService({ ffmpegService });
  const queue = new QueueService({ repo, downloadService, videoInfoService, files, logger, retryBaseMs });
  queue.init();

  const extension = { lastSeenAt: null, pairedEver: false };
  const pairing = createPairing(token);
  let actualPort = port;

  const app = express();
  app.disable('x-powered-by');
  app.use(hostGuard(() => actualPort));
  app.use(originGuard({ devOrigin }));
  app.use((req, res, next) => { // CORS only for origins that passed the guard
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', `Content-Type, ${authHeader}`);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '64kb' }));

  // ---- public endpoints (minimal information only) ----
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'video-downloader-pro' }));
  app.post('/api/pair', (req, res) => {
    if (!EXT_ORIGIN.test(req.headers.origin || '')) return res.status(403).json({ error: 'Pairing is only available to the Chrome extension.' });
    const r = pairing.redeem(req.body && req.body.code);
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    extension.pairedEver = true; extension.lastSeenAt = Date.now();
    res.json({ token: r.token });
  });

  // ---- authenticated API ----
  const api = express.Router();
  api.use(tokenAuth(token, authHeader, (req) => {
    if (EXT_ORIGIN.test(req.headers.origin || '')) { extension.lastSeenAt = Date.now(); extension.pairedEver = true; }
  }));
  api.get('/ping', (_req, res) => res.json({ ok: true }));
  api.post('/app/focus', (_req, res) => { onFocus && onFocus(); res.json({ ok: true }); });
  api.get('/stats', wrap(async (_req, res) => {
    const c = repo.countByStatus();
    const dir = repo.getSettings().downloadDirectory;
    let disk = null;
    try { disk = await files.getDiskSpace(dir); } catch { /* folder may not exist yet */ }
    res.json({
      active: (c.downloading || 0) + (c.analyzing || 0), queued: c.pending || 0, paused: c.paused || 0,
      completed: c.completed || 0, failed: c.failed || 0, disk,
      extension: { paired: extension.pairedEver, connected: !!extension.lastSeenAt && Date.now() - extension.lastSeenAt < 75_000 },
    });
  }));
  api.use(downloadRoutes(createDownloadController({ repo, queue, onUrlReceived })));
  api.use(videoRoutes(createVideoController({ videoInfoService })));
  api.use(settingsRoutes({ repo, queue, files, ffmpegService, onSettingsChanged }));
  app.use('/api', api);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.', code: 'VALIDATION' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.', code: 'VALIDATION' });
    logger.error('Unhandled API error', err);
    const dbError = /SQLITE|database/i.test(String(err.code || err.message));
    res.status(500).json({ error: dbError ? 'The app database had a problem. Restart the app; if it continues, see the troubleshooting guide.' : 'Something went wrong inside the app.', code: dbError ? 'DATABASE' : 'INTERNAL' });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      actualPort = server.address().port;
      resolve({
        port: actualPort, token, queue, repo, files, ffmpegService, logger,
        createPairingCode: () => pairing.createCode(),
        close() { queue.shutdown(); server.close(); server.closeAllConnections?.(); repo.close(); },
      });
    });
    server.once('error', reject);
  });
}

module.exports = { startServer };
