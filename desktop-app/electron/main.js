'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, session, shell, Notification, dialog } = require('electron');
const C = require('./constants');
const { createMainWindow, focusMainWindow, getMainWindow, isDev, DEV_URL } = require('./windowManager');
const { registerIpcHandlers, sendToRenderer } = require('./ipcHandlers');
const { startServer } = require('../backend/server');

let backend = null;
const PROTOCOL = 'vdp';

/** Persistent pairing token the Chrome extension receives after entering the pairing code. */
function loadOrCreateToken() {
  const file = path.join(app.getPath('userData'), 'pairing.json');
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof saved.token === 'string' && /^[a-f0-9]{64}$/.test(saved.token)) return saved.token;
  } catch { /* first run or corrupt file: regenerate */ }
  const token = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ token }), { mode: 0o600 });
  return token;
}

/** Content-Security-Policy for the renderer. Dev mode needs Vite's websocket + inline HMR. */
function installCsp() {
  const connect = `'self' http://${C.BACKEND_HOST}:*` + (isDev() ? ` ws://127.0.0.1:5173 ${DEV_URL}` : '');
  const script = isDev() ? "'self' 'unsafe-inline'" : "'self'";
  const csp = ["default-src 'self'", `script-src ${script}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https:",
    `connect-src ${connect}`, "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"].join('; ');
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
  });
}

function notify(title, body) {
  if (!backend || !backend.repo.getSettings().notificationsEnabled || !Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on('click', () => focusMainWindow());
  n.show();
}

/** Bridges queue events to the UI (real progress, no simulation) and to OS notifications. */
function wireQueueEvents() {
  backend.queue.on('progress', (p) => sendToRenderer(C.IPC.DOWNLOAD_PROGRESS, p));
  backend.queue.on('status', (e) => {
    sendToRenderer(C.IPC.DOWNLOAD_STATUS, e);
    const d = e.download;
    if (!d) return;
    if (e.status === 'completed') {
      notify('Download complete', d.title || 'Your video is ready');
      if (backend.repo.getSettings().autoOpenFolder && d.outputPath && fs.existsSync(d.outputPath)) shell.showItemInFolder(d.outputPath);
    } else if (e.status === 'failed') {
      notify('Download failed', d.errorMessage || d.title || 'A download failed');
    }
  });
}

// Only one running instance: the backend port and database must not be shared.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Register vdp:// so the Chrome extension's "Open Downloader" can launch the app.
  if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient(PROTOCOL);

  app.on('second-instance', () => focusMainWindow()); // also covers vdp://open launches while running

  app.whenReady().then(async () => {
    app.setAppUserModelId(C.APP_ID); // required for Windows notifications / taskbar grouping
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    installCsp();

    try {
      backend = await startServer({
        host: C.BACKEND_HOST, port: C.BACKEND_PORT, token: loadOrCreateToken(), authHeader: C.AUTH_HEADER,
        userDataPath: app.getPath('userData'),
        defaultDownloadDir: path.join(app.getPath('downloads'), 'VideoDownloaderPro'),
        binDir: app.isPackaged ? path.join(process.resourcesPath, 'bin') : path.join(__dirname, '..', 'bin'),
        devOrigin: isDev() ? DEV_URL : null,
        onFocus: () => focusMainWindow(),
        onUrlReceived: ({ download, pageTitle }) => {
          sendToRenderer(C.IPC.EXTENSION_URL_RECEIVED, { download, pageTitle });
          notify('Link received from Chrome', pageTitle || download.url);
        },
      });
    } catch (err) {
      dialog.showErrorBox('Video Downloader Pro could not start',
        `The local service failed to start (port ${C.BACKEND_PORT} may be in use by another program).\n\n${err.message}`);
      return app.quit();
    }

    wireQueueEvents();
    registerIpcHandlers({ backend });
    createMainWindow({ hidden: process.argv.includes('--hidden') }); // --hidden: started with Windows
    app.on('activate', () => focusMainWindow());
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

  // Stop child processes and persist a resumable state before exiting.
  app.on('before-quit', () => { if (backend) { backend.close(); backend = null; } });
}
