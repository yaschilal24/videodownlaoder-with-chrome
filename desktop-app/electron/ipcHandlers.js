'use strict';
const path = require('path');
const fs = require('fs');
const { ipcMain, dialog, shell, app, clipboard } = require('electron');
const C = require('./constants');
const { isTrustedUrl, getMainWindow } = require('./windowManager');

/**
 * Registers all IPC handlers. Every handler:
 *  1. verifies the sender is our own trusted window/frame,
 *  2. validates its arguments,
 *  3. never executes shell commands.
 * `backend` is the object returned by startServer().
 */
function registerIpcHandlers({ backend }) {
  function handle(channel, fn) {
    ipcMain.handle(channel, async (event, ...args) => {
      const win = getMainWindow();
      const trusted = win && event.sender === win.webContents && event.senderFrame && isTrustedUrl(event.senderFrame.url);
      if (!trusted) throw new Error('IPC rejected: untrusted sender');
      return fn(event, ...args);
    });
  }

  const isNonEmptyString = (v, max = 4096) => typeof v === 'string' && v.length > 0 && v.length <= max;
  const downloadDir = () => path.resolve(backend.repo.getSettings().downloadDirectory);
  const inside = (parent, child) => { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

  /** Only existing paths inside the configured download folder may be opened/revealed. */
  function safeDownloadPath(p) {
    if (!isNonEmptyString(p) || !path.isAbsolute(p)) throw new Error('Invalid path');
    const resolved = path.resolve(p);
    if (!inside(downloadDir(), resolved)) throw new Error('That file is outside the download folder.');
    if (!fs.existsSync(resolved)) throw new Error('The file no longer exists. It may have been moved or deleted.');
    return resolved;
  }

  handle(C.IPC.APP_INFO, () => ({
    name: C.APP_NAME, version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
    node: process.versions.node, platform: process.platform, userDataPath: app.getPath('userData'),
    defaultDownloadDir: path.join(app.getPath('downloads'), 'VideoDownloaderPro'),
  }));

  handle(C.IPC.BACKEND_INFO, () => ({
    baseUrl: `http://${C.BACKEND_HOST}:${backend.port}`, port: backend.port, token: backend.token, authHeader: C.AUTH_HEADER,
  }));

  handle(C.IPC.SELECT_DIRECTORY, async () => {
    const r = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  handle(C.IPC.OPEN_PATH, async (_e, p) => {
    const err = await shell.openPath(safeDownloadPath(p));
    if (err) throw new Error(err);
    return true;
  });

  handle(C.IPC.SHOW_ITEM, (_e, p) => { shell.showItemInFolder(safeDownloadPath(p)); return true; });

  handle(C.IPC.DISK_SPACE, async (_e, dir) => {
    if (!isNonEmptyString(dir) || !path.isAbsolute(dir)) throw new Error('Invalid directory');
    return backend.files.getDiskSpace(dir);
  });

  // The renderer has no clipboard permission (all permission requests are denied), so paste goes through main.
  handle(C.IPC.READ_CLIPBOARD, () => clipboard.readText().slice(0, 2048));

  // One-time pairing code for the Chrome extension.
  handle(C.IPC.PAIRING_CODE, () => backend.createPairingCode());

  handle(C.IPC.SET_LOGIN_ITEM, (_e, enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid value');
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
    return true;
  });
  handle(C.IPC.GET_LOGIN_ITEM, () => app.getLoginItemSettings().openAtLogin);
}

/** Push an event from main to the renderer. */
function sendToRenderer(channel, payload) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

module.exports = { registerIpcHandlers, sendToRenderer };
