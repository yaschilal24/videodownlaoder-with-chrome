'use strict';
const express = require('express');
const { wrap, validateId, requireUrl } = require('../middleware/validation');

function downloadRoutes(c) {
  const r = express.Router();
  r.post('/download/receive', requireUrl, wrap(c.receive));
  r.post('/downloads', requireUrl, wrap(c.create));
  r.get('/downloads', wrap(c.list));
  r.get('/downloads/:id', validateId, wrap(c.get));
  r.post('/downloads/:id/start', validateId, wrap(c.start));
  r.post('/downloads/:id/pause', validateId, wrap(c.pause));
  r.post('/downloads/:id/resume', validateId, wrap(c.resume));
  r.post('/downloads/:id/cancel', validateId, wrap(c.cancel));
  r.delete('/downloads/:id', validateId, wrap(c.remove));
  return r;
}

module.exports = { downloadRoutes };
