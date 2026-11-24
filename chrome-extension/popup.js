const $ = (id) => document.getElementById(id);
let tab = null;
let token = null;
let state = 'checking'; // offline | unpaired | connected

function show(text, kind) {
  const el = $('message');
  el.textContent = text; el.className = `message ${kind}`; el.hidden = !text;
}

function setState(next) {
  state = next;
  const pill = $('status');
  const map = { offline: ['Desktop app not running', 'pill-off'], unpaired: ['Not paired', 'pill-warn'], connected: ['Connected', 'pill-on'], checking: ['Checking…', 'pill-off'] };
  pill.textContent = map[next][0]; pill.className = `pill ${map[next][1]}`;
  $('pairing').hidden = next !== 'unpaired';
  updateSendButton();
}

function sendable() { return !!tab && /^https?:\/\//i.test(tab.url || ''); }
function updateSendButton() { $('sendBtn').disabled = !(state === 'connected' && sendable()); }

async function checkConnection() {
  const health = await vdpFetch('/api/health');
  if (health.offline) return setState('offline');
  ({ token } = await chrome.storage.local.get('token'));
  if (!token) return setState('unpaired');
  const ping = await vdpFetch('/api/ping', { token });
  if (ping.status === 401) { await chrome.storage.local.remove('token'); token = null; return setState('unpaired'); }
  setState(ping.ok ? 'connected' : 'offline');
  chrome.runtime.sendMessage({ type: 'refresh' });
}

async function loadTab() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let title = tab?.title || '';
  if (sendable()) {
    try { // read the page's own title via the Scripting API (may be blocked on some pages)
      const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      if (res?.result?.title) title = res.result.title;
    } catch { /* restricted page – fall back to tab title */ }
  }
  $('title').textContent = title || '(no title)';
  $('url').textContent = tab?.url || '';
  $('url').title = tab?.url || '';
  if (!sendable()) show('This page cannot be downloaded. Open a normal web page with a video.', 'err');
}

async function send() {
  if (!sendable()) return show('There is no web address to send.', 'err'); // never send empty URLs
  $('sendBtn').disabled = true;
  const r = await vdpFetch('/api/download/receive', { method: 'POST', token, body: { url: tab.url, title: $('title').textContent } });
  if (r.offline) { setState('offline'); return show('The desktop app is not running. Click "Open Downloader" first.', 'err'); }
  if (r.status === 401) { await chrome.storage.local.remove('token'); setState('unpaired'); return show('Pairing expired. Pair again.', 'err'); }
  if (!r.ok) { updateSendButton(); return show(r.json?.error || 'The desktop app rejected this link.', 'err'); }
  show(r.json.duplicate ? 'This video is already in your downloads.' : 'Sent! Check Video Downloader Pro to choose the quality.', 'ok');
  updateSendButton();
}

async function pair() {
  const code = $('code').value.trim();
  if (!/^\d{6}$/.test(code)) return show('Enter the 6-digit code shown in the desktop app.', 'err');
  const r = await vdpFetch('/api/pair', { method: 'POST', body: { code } });
  if (r.offline) return setState('offline');
  if (!r.ok) return show(r.json?.error || 'Pairing failed.', 'err');
  await chrome.storage.local.set({ token: r.json.token });
  show('Paired successfully.', 'ok');
  $('code').value = '';
  await checkConnection();
}

async function openDownloader() {
  if (state === 'connected') {
    const r = await vdpFetch('/api/app/focus', { method: 'POST', token });
    if (r.ok) return window.close();
  }
  // App not running: launch it through its registered vdp:// protocol, then close the helper tab.
  const t = await chrome.tabs.create({ url: VDP.APP_PROTOCOL_URL, active: false });
  setTimeout(() => chrome.tabs.remove(t.id).catch(() => {}), 1500);
  show('Starting Video Downloader Pro… (if nothing happens, start it from the Start menu)', 'ok');
  // The background alarm reconnects automatically; poll quickly while the popup is open.
  for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 1000)); await checkConnection(); if (state !== 'offline') break; }
}

$('sendBtn').addEventListener('click', send);
$('pairBtn').addEventListener('click', pair);
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') pair(); });
$('openBtn').addEventListener('click', openDownloader);

(async () => { await loadTab(); await checkConnection(); })();
setInterval(checkConnection, 4000); // live status while the popup is open
