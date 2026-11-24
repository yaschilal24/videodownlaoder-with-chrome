import React, { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import VideoPreview from '../components/VideoPreview.jsx';
import DownloadCard from '../components/DownloadCard.jsx';
import { useDownloads } from '../hooks/useDownloads.js';
import { useDesktopAPI } from '../hooks/useDesktopAPI.js';
import { api } from '../services/api.js';
import { formatBytes } from '../services/format.js';

function Tile({ label, value, tone }) {
  return <div className="card p-4"><div className="text-xs text-muted">{label}</div><div className={`mt-1 text-xl font-semibold ${tone || ''}`}>{value}</div></div>;
}

export default function Dashboard({ onNavigate }) {
  const { settings, stats, incoming, dismissIncoming, create, start, downloads, toast } = useDownloads();
  const desk = useDesktopAPI();
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState(null);
  const [target, setTarget] = useState(null); // { url, existingId }
  const [sel, setSel] = useState({ format: 'mp4', quality: 'best' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (settings) setSel({ format: settings.defaultFormat, quality: settings.defaultQuality }); }, [settings?.defaultFormat, settings?.defaultQuality]);

  async function analyze(rawUrl = url, existingId = null) {
    const u = rawUrl.trim();
    if (!u) return toast('Paste a video page link first.', 'error');
    setBusy(true); setInfo(null);
    try {
      const result = await api.analyze(u);
      setInfo(result); setTarget({ url: u, existingId });
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function paste() { const t = await desk.readClipboard(); if (t) setUrl(t.trim()); }

  function analyzeIncoming() { setUrl(incoming.url); analyze(incoming.url, incoming.id); dismissIncoming(); }

  async function startDownload() {
    setBusy(true);
    const r = target.existingId
      ? await start(target.existingId, sel)
      : await create({ url: target.url, ...sel, title: info.title, thumbnail: info.thumbnail, startNow: true });
    setBusy(false);
    if (r) { setInfo(null); setUrl(''); setTarget(null); onNavigate('downloads'); }
  }

  const extStatus = !stats ? '…' : stats.extension.connected ? 'Connected' : stats.extension.paired ? 'Waiting for Chrome' : 'Not paired';
  const extTone = stats?.extension.connected ? 'text-emerald-500' : 'text-amber-500';

  return (
    <div className="page-enter">
      <Header title="Dashboard" subtitle="Paste a link or send one from the Chrome extension." />

      {incoming && (
        <div className="card mb-4 flex items-center gap-3 border-accent/50 p-3 text-sm">
          <span>🌐</span><span className="min-w-0 flex-1 truncate">Received from Chrome: <b>{incoming.url}</b></span>
          <button className="btn btn-primary" onClick={analyzeIncoming}>Analyze</button>
          <button className="btn" onClick={dismissIncoming}>Dismiss</button>
        </div>
      )}

      <div className="card mb-4 p-4">
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="https://… paste a video page link" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && analyze()} />
          <button className="btn" onClick={paste}>Paste URL</button>
          <button className="btn btn-primary" onClick={() => analyze()} disabled={busy}>{busy && !info ? 'Analyzing…' : 'Analyze Video'}</button>
        </div>
        <p className="mt-2 text-xs text-muted">Only supported, publicly available videos can be downloaded. Protected (DRM), paid or login-only content is not supported.</p>
      </div>

      {info && <div className="mb-4"><VideoPreview info={info} format={sel.format} quality={sel.quality} onChange={setSel} onStart={startDownload} busy={busy} /></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Active downloads" value={stats ? stats.active : '…'} />
        <Tile label="Completed" value={stats ? stats.completed : '…'} />
        <Tile label="Free disk space" value={stats?.disk ? formatBytes(stats.disk.free) : '—'} />
        <Tile label="Chrome extension" value={extStatus} tone={extTone} />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-muted">Recent downloads</h2>
      {downloads.length === 0
        ? <div className="card p-6 text-center text-sm text-muted">No downloads yet.</div>
        : <div className="space-y-3">{downloads.slice(0, 4).map((d) => <DownloadCard key={d.id} d={d} />)}</div>}
    </div>
  );
}
