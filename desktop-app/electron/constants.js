'use strict';
const path = require('path');
const { app } = require('electron');

// In development shared/ sits next to desktop-app/. In the packaged app,
// electron-builder copies it to <resources>/shared (see extraResources).
const sharedPath = app.isPackaged
  ? path.join(process.resourcesPath, 'shared', 'constants.js')
  : path.join(__dirname, '..', '..', 'shared', 'constants.js');

module.exports = require(sharedPath);
