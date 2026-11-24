import React from 'react';

const ICONS = {
  dashboard: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  downloads: 'M12 3v12m0 0l-4-4m4 4l4-4M4 19h16',
  history: 'M12 8v5l3 2M3 12a9 9 0 109-9 9 9 0 00-7 3.5L3 8m0-4v4h4',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7-3a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12a7 7 0 00.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  about: 'M12 16v-4m0-4h.01M12 22a10 10 0 100-20 10 10 0 000 20z',
};
const ITEMS = [['dashboard', 'Dashboard'], ['downloads', 'Downloads'], ['history', 'Download History'], ['settings', 'Settings'], ['about', 'About']];

export default function Sidebar({ page, onNavigate, activeCount }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel p-3">
      <div className="mb-5 flex items-center gap-2 px-2 pt-2">
        <img src="./icon.png" alt="" className="h-8 w-8 rounded-lg" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <span className="text-sm font-semibold leading-tight">Video Downloader<br />Pro</span>
      </div>
      <nav className="flex flex-col gap-1">
        {ITEMS.map(([key, label]) => (
          <button key={key} onClick={() => onNavigate(key)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${page === key ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-line/40 hover:text-ink'}`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[key]} /></svg>
            <span className="flex-1">{label}</span>
            {key === 'downloads' && activeCount > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-white">{activeCount}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
