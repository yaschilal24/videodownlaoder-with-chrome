'use strict';
const path = require('path');
const { BrowserWindow, shell, app } = require('electron');

let mainWindow = null;
const DEV_URL = 'http://127.0.0.1:5173';

const isDev = () => !app.isPackaged && process.env.NODE_ENV === 'development';

/** True only for content that belongs to this app (Vite dev server or our built files). */
function isTrustedUrl(url) {
  try {
    const u = new URL(url);
    if (isDev()) return u.origin === DEV_URL;
    if (u.protocol !== 'file:') return false;
    const distDir = path.join(__dirname, '..', 'dist');
    const file = path.normalize(decodeURIComponent(u.pathname.replace(/^\/([A-Za-z]:)/, '$1')));
    return file.toLowerCase().startsWith(distDir.toLowerCase());
  } catch {
    return false;
  }
}

function createMainWindow({ hidden = false } = {}) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false, // shown on ready-to-show to avoid a white flash
    backgroundColor: '#020617',
    title: 'Video Downloader Pro',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: isDev(),
    },
  });

  const wc = mainWindow.webContents;

  // Block window.open(); send genuine web links to the system browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Block navigation away from trusted app content.
  wc.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
  wc.on('will-attach-webview', (event) => event.preventDefault());

  mainWindow.once('ready-to-show', () => { if (!hidden) mainWindow.show(); });
  mainWindow.on('closed', () => { mainWindow = null; });

  if (isDev()) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  return mainWindow;
}

const getMainWindow = () => mainWindow;

function focusMainWindow() {
  if (!mainWindow) return createMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

module.exports = { createMainWindow, getMainWindow, focusMainWindow, isTrustedUrl, isDev, DEV_URL };
