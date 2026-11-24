'use strict';
// Constants shared by the Electron app and backend (and mirrored in the Chrome extension).

module.exports = Object.freeze({
  APP_NAME: 'Video Downloader Pro',
  APP_ID: 'com.videodownloaderpro.app',

  // Backend binds to loopback ONLY. Never 0.0.0.0.
  BACKEND_HOST: '127.0.0.1',
  BACKEND_PORT: 47615,

  // Header the extension must send with the pairing token.
  AUTH_HEADER: 'x-vdp-token',

  DOWNLOAD_STATUS: Object.freeze({
    PENDING: 'pending',
    ANALYZING: 'analyzing',
    DOWNLOADING: 'downloading',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
  }),

  // Whitelisted IPC channels. Anything not listed here is rejected.
  IPC: Object.freeze({
    APP_INFO: 'app:get-info',
    BACKEND_INFO: 'app:get-backend-info',
    SELECT_DIRECTORY: 'dialog:select-directory',
    OPEN_PATH: 'shell:open-path',
    SHOW_ITEM: 'shell:show-item-in-folder',
    DISK_SPACE: 'system:get-disk-space',
    READ_CLIPBOARD: 'clipboard:read-text',
    PAIRING_CODE: 'pairing:new-code',
    SET_LOGIN_ITEM: 'app:set-login-item',
    GET_LOGIN_ITEM: 'app:get-login-item',
    // main -> renderer events
    DOWNLOAD_PROGRESS: 'download:progress',
    DOWNLOAD_STATUS: 'download:status',
    EXTENSION_URL_RECEIVED: 'extension:url-received',
  }),
});
