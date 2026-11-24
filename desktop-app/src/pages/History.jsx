import React, { useState } from 'react';
import Header from '../components/Header.jsx';
import DownloadQueue from '../components/DownloadQueue.jsx';
import { useDownloads } from '../hooks/useDownloads.js';

export default function History() {
  const { history } = useDownloads();
  const [q, setQ] = useState('');
  const items = history.filter((d) => `${d.title || ''} ${d.url}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page-enter">
      <Header title="Download History" subtitle={`${history.length} finished downloads`}
        right={<input className="input w-64" placeholder="Search history…" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <DownloadQueue items={items} emptyTitle="No history yet" emptyText="Finished, failed and cancelled downloads appear here." />
    </div>
  );
}
