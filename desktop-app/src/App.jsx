import React, { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Downloads from './pages/Downloads.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import About from './pages/About.jsx';
import { DownloadProvider } from './context/DownloadContext.jsx';
import { useDownloads } from './hooks/useDownloads.js';

function Shell() {
  const [page, setPage] = useState('dashboard');
  const { current, toasts, fatal } = useDownloads();
  const pages = { dashboard: <Dashboard onNavigate={setPage} />, downloads: <Downloads />, history: <History />, settings: <Settings />, about: <About /> };

  if (fatal) {
    return <div className="flex h-full items-center justify-center p-8 text-center"><div className="card max-w-md p-6"><h1 className="mb-2 text-lg font-semibold">Can't reach the background service</h1><p className="text-sm text-muted">{fatal}</p></div></div>;
  }
  return (
    <div className="flex h-full">
      <Sidebar page={page} onNavigate={setPage} activeCount={current.length} />
      <main className="flex-1 overflow-y-auto p-6">{pages[page]}</main>
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`page-enter pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-lg ${t.kind === 'error' ? 'border-red-500/50 bg-red-950 text-red-100' : t.kind === 'success' ? 'border-emerald-500/50 bg-emerald-950 text-emerald-100' : 'border-line bg-panel'}`}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return <DownloadProvider><Shell /></DownloadProvider>;
}
