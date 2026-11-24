'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed preloads cannot require() local files, so channel names are duplicated here.
// They must match shared/constants.js (IPC).
const CH = {
  APP_INFO: 'app:get-info', BACKEND_INFO: 'app:get-backend-info', SELECT_DIRECTORY: 'dialog:select-directory',
  OPEN_PATH: 'shell:open-path', SHOW_ITEM: 'shell:show-item-in-folder', DISK_SPACE: 'system:get-disk-space',
  READ_CLIPBOARD: 'clipboard:read-text', PAIRING_CODE: 'pairing:new-code',
  SET_LOGIN_ITEM: 'app:set-login-item', GET_LOGIN_ITEM: 'app:get-login-item',
};
const EVENTS = new Set(['download:progress', 'download:status', 'extension:url-received']);

// Only these narrow functions reach the renderer. No raw ipcRenderer, no Node APIs.
contextBridge.exposeInMainWorld('desktop', {
  getAppInfo: () => ipcRenderer.invoke(CH.APP_INFO),
  getBackendInfo: () => ipcRenderer.invoke(CH.BACKEND_INFO),
  selectDirectory: () => ipcRenderer.invoke(CH.SELECT_DIRECTORY),
  openPath: (p) => ipcRenderer.invoke(CH.OPEN_PATH, String(p)),
  showItemInFolder: (p) => ipcRenderer.invoke(CH.SHOW_ITEM, String(p)),
  getDiskSpace: (dir) => ipcRenderer.invoke(CH.DISK_SPACE, String(dir)),
  readClipboard: () => ipcRenderer.invoke(CH.READ_CLIPBOARD),
  newPairingCode: () => ipcRenderer.invoke(CH.PAIRING_CODE),
  setStartWithWindows: (on) => ipcRenderer.invoke(CH.SET_LOGIN_ITEM, !!on),
  getStartWithWindows: () => ipcRenderer.invoke(CH.GET_LOGIN_ITEM),

  /** Subscribe to a whitelisted main->renderer event. Returns an unsubscribe function. */
  on: (event, callback) => {
    if (!EVENTS.has(event) || typeof callback !== 'function') return () => {};
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
});
