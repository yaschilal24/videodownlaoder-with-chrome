// Thin client for the local REST API. The base URL and pairing token come from the secure preload bridge.
export class ApiError extends Error {
  constructor(message, status = 0, code = 'UNKNOWN') { super(message); this.status = status; this.code = code; }
}

let backend = null;
async function connection() {
  if (!window.desktop) throw new ApiError('This page must run inside Video Downloader Pro.', 0, 'NO_BRIDGE');
  if (!backend) backend = await window.desktop.getBackendInfo();
  return backend;
}

async function request(path, { method = 'GET', body } = {}) {
  const b = await connection();
  let res;
  try {
    res = await fetch(`${b.baseUrl}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', [b.authHeader]: b.token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    backend = null;
    throw new ApiError('The background service is not responding. Please restart Video Downloader Pro.', 0, 'OFFLINE');
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error || `Request failed (${res.status})`, res.status, json?.code);
  return json;
}

export const api = {
  stats: () => request('/stats'),
  list: () => request('/downloads'),
  analyze: (url) => request('/video/analyze', { method: 'POST', body: { url } }),
  create: (payload) => request('/downloads', { method: 'POST', body: payload }),
  start: (id, selection = {}) => request(`/downloads/${id}/start`, { method: 'POST', body: selection }),
  pause: (id) => request(`/downloads/${id}/pause`, { method: 'POST' }),
  resume: (id) => request(`/downloads/${id}/resume`, { method: 'POST' }),
  cancel: (id) => request(`/downloads/${id}/cancel`, { method: 'POST' }),
  remove: (id) => request(`/downloads/${id}`, { method: 'DELETE' }),
  getSettings: () => request('/settings'),
  updateSettings: (patch) => request('/settings', { method: 'PUT', body: patch }),
  resetSettings: () => request('/settings/reset', { method: 'POST' }),
};
