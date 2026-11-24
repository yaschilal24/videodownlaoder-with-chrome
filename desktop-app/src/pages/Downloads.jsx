import React from 'react';
import Header from '../components/Header.jsx';
import DownloadQueue from '../components/DownloadQueue.jsx';
import { useDownloads } from '../hooks/useDownloads.js';

export default function Downloads() {
  const { current } = useDownloads();
  return (
    <div className="page-enter">
      <Header title="Downloads" subtitle={`${current.length} in progress or waiting`} />
      <DownloadQueue items={current} emptyTitle="No active downloads" emptyText="Analyze a video on the Dashboard, or click the Chrome extension on a video page." />
    </div>
  );
}
