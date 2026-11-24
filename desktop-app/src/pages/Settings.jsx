import React, { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import { useDownloads } from '../hooks/useDownloads.js';
import { useDesktopAPI } from '../hooks/useDesktopAPI.js';

function Row({ label, hint, children }) {
  return <div className="flex items-center justify-between gap-6 border-b border-line py-3 last:border-0"><div><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div><div className="w-64 shrink-0">{children}</div></div>;
}
const Toggle = ({ checked, onChange }) => (
  <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`ml-auto flex h-6 w-11 items-center rounded-full p-0.5 ${checked ? 'bg-accent' : 'bg-line'}`}>
    <span className={`h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

export default function Settings() {
  const { settings, stats, saveSettings, resetSettings, reloadSettings, toast } = useDownloads();
  const desk = useDesktopAPI();
  const [pair, setPair] = useState(null); // { code, expiresAt }
  const [left, setLeft] = useState(0);

  useEffect(() => { reloadSettings(); }, []); // refresh tool status each time the page opens
  useEffect(() => {
    if (!pair) return undefined;
    const t = setInterval(() => { const s = Math.max(0, Math.round((pair.expiresAt - Date.now()) / 1000)); setLeft(s); if (!s) setPair(null); }, 500);
    return () => clearInterval(t);
  }, [pair]);

  if (!settings) return <div className="text-sm text-muted">Loading settings…</div>;
  const set = (patch) => saveSettings(patch);

  async function chooseDir() { const d = await desk.selectDirectory(); if (d) set({ downloadDirectory: d }); }
  async function toggleStartup(on) { const ok = await desk.setStartWithWindows(on); if (ok) set({ startWithWindows: on }); }
  async function makeCode() { const r = await desk.newPairingCode(); if (r) { setPair({ code: r.code, expiresAt: Date.now() + r.expiresInSeconds * 1000 }); setLeft(r.expiresInSeconds); } }
  const tools = settings.tools || {};

  return (
    <div className="page-enter max-w-3xl">
      <Header title="Settings" subtitle="Changes are saved automatically." />

      <div className="card mb-4 px-4">
        <Row label="Download location" hint={settings.downloadDirectory}><button className="btn w-full" onClick={chooseDir}>Choose folder…</button></Row>
        <Row label="Default quality">
          <select className="input" value={settings.defaultQuality} onChange={(e) => set({ defaultQuality: e.target.value })}>
            {['best', '2160', '1440', '1080', '720', '480', '360'].map((q) => <option key={q} value={q}>{q === 'best' ? 'Best available' : `Up to ${q}p`}</option>)}
          </select>
        </Row>
        <Row label="Default format">
          <select className="input" value={settings.defaultFormat} onChange={(e) => set({ defaultFormat: e.target.value })}>
            {['mp4', 'webm', 'mp3', 'm4a'].map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>
        </Row>
        <Row label="Simultaneous downloads" hint="1 – 10">
          <select className="input" value={settings.maxConcurrentDownloads} onChange={(e) => set({ maxConcurrentDownloads: Number(e.target.value) })}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Row>
        <Row label="Theme">
          <select className="input" value={settings.theme} onChange={(e) => set({ theme: e.target.value })}><option value="dark">Dark</option><option value="light">Light</option></select>
        </Row>
        <Row label="Desktop notifications"><Toggle checked={settings.notificationsEnabled} onChange={(v) => set({ notificationsEnabled: v })} /></Row>
        <Row label="Start with Windows" hint="Works in the installed app"><Toggle checked={settings.startWithWindows} onChange={toggleStartup} /></Row>
        <Row label="Open folder when finished"><Toggle checked={settings.autoOpenFolder} onChange={(v) => set({ autoOpenFolder: v })} /></Row>
      </div>

      <div className="card mb-4 p-4">
        <h2 className="mb-1 text-sm font-semibold">Chrome extension</h2>
        <p className="mb-3 text-xs text-muted">Status: {stats?.extension.connected ? '🟢 connected' : stats?.extension.paired ? '🟡 paired, waiting for Chrome' : '🔴 not paired'}. Load the <code>chrome-extension</code> folder in <code>chrome://extensions</code> (Developer mode → Load unpacked), open its popup and enter the code below.</p>
        {pair
          ? <div className="flex items-center gap-4"><span className="rounded-lg bg-surface px-4 py-2 font-mono text-2xl tracking-[0.3em]">{pair.code}</span><span className="text-xs text-muted">expires in {left}s</span></div>
          : <button className="btn btn-primary" onClick={makeCode}>Generate pairing code</button>}
      </div>

      <div className="card mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold">Download engine</h2>
        <ul className="space-y-1 text-sm">
          <li>yt-dlp: {tools.ytdlp?.found ? <>✅ {tools.ytdlp.version}{tools.ytdlp.outdated && <span className="text-amber-500"> – outdated, update it if some sites fail</span>}</> : <span className="text-red-500">❌ not found – run scripts/prepare-binaries.js or reinstall</span>}</li>
          <li>FFmpeg: {tools.ffmpeg?.found ? <>✅ {tools.ffmpeg.version}</> : <span className="text-red-500">❌ not found – videos cannot be merged or converted</span>}</li>
        </ul>
      </div>

      <button className="btn btn-danger" onClick={() => window.confirm('Reset all settings to their defaults?') && resetSettings()}>Reset settings</button>
    </div>
  );
}
