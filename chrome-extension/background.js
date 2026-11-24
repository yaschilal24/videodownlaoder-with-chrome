// Service worker: keeps the desktop connection fresh so the app shows "Connected" and the badge reflects status.
importScripts('config.js');

async function refresh() {
  const { token } = await chrome.storage.local.get('token');
  const health = await vdpFetch('/api/health');
  if (health.offline) return setBadge('!', '#ef4444', 'Desktop app is not running');
  if (!token) return setBadge('?', '#f59e0b', 'Not paired with the desktop app');
  const ping = await vdpFetch('/api/ping', { token });
  if (ping.status === 401) { await chrome.storage.local.remove('token'); return setBadge('?', '#f59e0b', 'Pairing expired – pair again'); }
  if (ping.ok) return setBadge('', '#22c55e', 'Connected to Video Downloader Pro');
  return setBadge('!', '#ef4444', 'Desktop app not reachable');
}

function setBadge(text, color, title) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setTitle({ title: `Video Downloader Pro – ${title}` });
}

// Alarms survive the service worker being suspended; this is how we reconnect automatically
// as soon as the desktop app starts.
function schedule() { chrome.alarms.create('vdp-poll', { periodInMinutes: VDP.POLL_MINUTES }); }
chrome.runtime.onInstalled.addListener(() => { schedule(); refresh(); });
chrome.runtime.onStartup.addListener(() => { schedule(); refresh(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'vdp-poll') refresh(); });
chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'refresh') refresh(); });
