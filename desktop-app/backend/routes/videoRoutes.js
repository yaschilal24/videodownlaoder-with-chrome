'use strict';
const express = require('express');
const { wrap, requireUrl } = require('../middleware/validation');

function videoRoutes(c) {
  const r = express.Router();
  r.post('/video/analyze', requireUrl, wrap(c.analyze));
  return r;
}

module.exports = { videoRoutes };
