'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.VDP_QUIET = '1';
const FAKE = path.join(__dirname, 'fixtures', 'fake-yt-dlp.js');
const { startServer } = require('../desktop-app/backend/server');

const TOKEN = 'a'.repeat(64);
const EXT_ORIGIN = 'chrome-extension://' + 'a'.repeat(32);
// The yt-dlp stand-in is a Node script with a shebang, so engine tests run on Linux/macOS/WSL.
const SKIP_ENGINE = process.platform === 'win32' ? 'engine tests need a POSIX shell (use WSL)' : false;

async function startTestServer(opts = {}) {
  fs.chmodSync(FAKE, 0o755);
  process.env.VDP_YTDLP_PATH = opts.noYtdlp ? path.join(os.tmpdir(), 'definitely-missing-yt-dlp') : FAKE;
  const tmp = opts.tmp || fs.mkdtempSync(path.join(os.tmpdir(), 'vdp-'));
  const calls = { received: [], focus: 0 };
  const srv = await startServer({
    port: 0, token: TOKEN, userDataPath: path.join(tmp, 'data'), defaultDownloadDir: path.join(tmp, 'dl'),
    retryBaseMs: 20, onUrlReceived: (d) => calls.received.push(d), onFocus: () => { calls.focus++; }, ...opts.server,
  });
  const base = `http://127.0.0.1:${srv.port}`;
  async function call(method, p, body, headers = {}) {
    const r = await fetch(base + p, {
      method, headers: { 'content-type': 'application/json', 'x-vdp-token': TOKEN, ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* empty body */ }
    return { status: r.status, json };
  }
  return { srv, base, tmp, call, calls, dlDir: path.join(tmp, 'dl'), close: () => srv.close() };
}

async function waitFor(fn, { timeout = 10000, interval = 25, what = 'condition' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}

const waitStatus = (t, id, status) =>
  waitFor(async () => { const r = await t.call('GET', `/api/downloads/${id}`); return r.json.status === status ? r.json : null; }, { what: `status ${status}` });

module.exports = { startTestServer, waitFor, waitStatus, TOKEN, EXT_ORIGIN, SKIP_ENGINE };
