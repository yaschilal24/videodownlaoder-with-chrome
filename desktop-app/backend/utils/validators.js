'use strict';
const path = require('path');
const net = require('net');

const FORMATS = ['mp4', 'webm', 'mp3', 'm4a'];
const QUALITIES = ['best', '2160', '1440', '1080', '720', '480', '360'];
const THEMES = ['dark', 'light'];
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPrivateHost(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (net.isIPv4(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(h)) return h === '::1' || h === '::' || /^f[cd]/.test(h) || h.startsWith('fe80');
  return false;
}

/** Validates a page URL coming from the UI or the extension. Only public http(s) URLs are accepted. */
function validateUrl(input) {
  if (typeof input !== 'string') return { ok: false, error: 'The link is missing.' };
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'The link is empty.' };
  if (raw.length > 2048) return { ok: false, error: 'The link is too long.' };
  if (/[\s\u0000-\u001f]/.test(raw)) return { ok: false, error: 'The link contains invalid characters.' };
  let u;
  try { u = new URL(raw); } catch { return { ok: false, error: 'This is not a valid web address.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Only http and https links are supported.' };
  if (u.username || u.password) return { ok: false, error: 'Links containing a username or password are not allowed.' };
  if (!u.hostname || isPrivateHost(u.hostname)) return { ok: false, error: 'Local or private network addresses are not allowed.' };
  return { ok: true, url: u.toString() };
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function sanitizeFilename(name, max = 150) {
  let s = String(name ?? '').normalize('NFC')
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ').trim()
    .replace(/[. ]+$/, '');
  if (!s || WINDOWS_RESERVED.test(s)) s = `video_${s || 'file'}`;
  return s.slice(0, max);
}

/** True when `child` is `parent` itself or lies inside it (after resolving ".."). */
function isPathInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

const BLOCKED_DIRS = ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata',
  '/etc', '/bin', '/sbin', '/usr', '/sys', '/proc', '/boot', '/dev'];

function validateOutputDir(dir) {
  if (typeof dir !== 'string' || !dir.trim()) return { ok: false, error: 'Choose a download folder.' };
  if (dir.includes('\0') || dir.length > 1024) return { ok: false, error: 'The folder path is invalid.' };
  if (!path.isAbsolute(dir)) return { ok: false, error: 'The folder path must be absolute.' };
  const resolved = path.resolve(dir);
  if (path.parse(resolved).root === resolved) return { ok: false, error: 'Please choose a folder, not a whole drive.' };
  const low = resolved.toLowerCase();
  if (BLOCKED_DIRS.some((b) => low === b || low.startsWith(b + '\\') || low.startsWith(b + '/'))) {
    return { ok: false, error: 'That folder is protected by the system. Choose another one.' };
  }
  return { ok: true, dir: resolved };
}

const isBool = (v) => typeof v === 'boolean';

/** Validates a partial settings update; returns only known, validated keys. */
function validateSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, error: 'Invalid settings.' };
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    switch (k) {
      case 'downloadDirectory': { const r = validateOutputDir(v); if (!r.ok) return r; out[k] = r.dir; break; }
      case 'maxConcurrentDownloads':
        if (!Number.isInteger(v) || v < 1 || v > 10) return { ok: false, error: 'Simultaneous downloads must be between 1 and 10.' };
        out[k] = v; break;
      case 'defaultQuality': if (!QUALITIES.includes(v)) return { ok: false, error: 'Unknown quality.' }; out[k] = v; break;
      case 'defaultFormat': if (!FORMATS.includes(v)) return { ok: false, error: 'Unknown format.' }; out[k] = v; break;
      case 'theme': if (!THEMES.includes(v)) return { ok: false, error: 'Unknown theme.' }; out[k] = v; break;
      case 'notificationsEnabled': case 'startWithWindows': case 'autoOpenFolder':
        if (!isBool(v)) return { ok: false, error: `${k} must be true or false.` }; out[k] = v; break;
      default: return { ok: false, error: `Unknown setting: ${k}` };
    }
  }
  return { ok: true, value: out };
}

module.exports = { FORMATS, QUALITIES, THEMES, ID_RE, validateUrl, sanitizeFilename, isPathInside, validateOutputDir, validateSettingsPatch };
