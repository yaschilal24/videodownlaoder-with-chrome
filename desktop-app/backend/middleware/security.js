'use strict';
const crypto = require('crypto');

const EXT_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

/**
 * Guards for the loopback-only API:
 *  - hostGuard:   blocks DNS-rebinding (Host must be 127.0.0.1/localhost on our port)
 *  - originGuard: allows only our renderer (file:// => "null", or the dev server) and chrome-extension:// pages
 *  - tokenAuth:   constant-time check of the pairing token
 */
function hostGuard(getPort) {
  return (req, res, next) => {
    const p = typeof getPort === 'function' ? getPort() : getPort;
    if (req.headers.host !== `127.0.0.1:${p}` && req.headers.host !== `localhost:${p}`) {
      return res.status(403).json({ error: 'Forbidden host' });
    }
    next();
  };
}

function originGuard({ devOrigin } = {}) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next(); // non-browser clients (tests, curl); still need the token
    if (origin === 'null' || origin === devOrigin || EXT_ORIGIN.test(origin)) return next();
    return res.status(403).json({ error: 'Forbidden origin' });
  };
}

function tokenAuth(token, headerName, onAuthed) {
  const expected = Buffer.from(token);
  return (req, res, next) => {
    const given = Buffer.from(String(req.headers[headerName] || ''));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(401).json({ error: 'Not paired. Pair the extension from the app first.', code: 'UNAUTHORIZED' });
    }
    if (onAuthed) onAuthed(req);
    next();
  };
}

/**
 * One-time pairing codes: the app shows a 6-digit code (valid 2 minutes); the extension exchanges it
 * for the long-lived token. Failed attempts are rate-limited globally to stop brute force.
 */
function createPairing(token) {
  let current = null;
  let failures = 0, lockedUntil = 0;
  return {
    createCode() {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      current = { code, expires: Date.now() + 120_000 };
      return { code, expiresInSeconds: 120 };
    },
    redeem(input) {
      if (Date.now() < lockedUntil) return { ok: false, status: 429, error: 'Too many wrong codes. Wait a minute and try again.' };
      const valid = current && Date.now() < current.expires &&
        typeof input === 'string' && input.length === 6 &&
        crypto.timingSafeEqual(Buffer.from(input), Buffer.from(current.code));
      if (!valid) {
        if (++failures >= 5) { lockedUntil = Date.now() + 60_000; failures = 0; }
        return { ok: false, status: 401, error: 'The pairing code is wrong or has expired.' };
      }
      current = null; failures = 0; // single use
      return { ok: true, token };
    },
  };
}

module.exports = { hostGuard, originGuard, tokenAuth, createPairing, EXT_ORIGIN };
