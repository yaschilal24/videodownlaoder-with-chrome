'use strict';
const { AppError } = require('../utils/errors');
const { ID_RE, validateUrl } = require('../utils/validators');

/** Wraps async route handlers so rejected promises reach the error handler. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function validateId(req, _res, next) {
  if (!ID_RE.test(req.params.id)) return next(new AppError('VALIDATION', 'Invalid download id.', 400));
  next();
}

/** Requires a valid public http(s) URL in body.url and stores the normalised value in req.validUrl. */
function requireUrl(req, _res, next) {
  const r = validateUrl(req.body && req.body.url);
  if (!r.ok) return next(new AppError('INVALID_URL', r.error, 400));
  req.validUrl = r.url;
  next();
}

module.exports = { wrap, validateId, requireUrl };
