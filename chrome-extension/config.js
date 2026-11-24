// Shared by popup.js and background.js. Port must match shared/constants.js (BACKEND_PORT).
const VDP = {
  BASE_URL: 'http://127.0.0.1:47615',
  AUTH_HEADER: 'x-vdp-token',
  APP_PROTOCOL_URL: 'vdp://open', // registered by the installer; launches the desktop app
  POLL_MINUTES: 0.5,
};

/** fetch with timeout; resolves {ok,status,json} or {ok:false,offline:true} when the app is not running. */
async function vdpFetch(path, { method = 'GET', body, token, timeout = 3000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(VDP.BASE_URL + path, {
      method, signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { [VDP.AUTH_HEADER]: token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, offline: true };
  } finally {
    clearTimeout(timer);
  }
}
