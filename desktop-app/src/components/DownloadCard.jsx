import React from 'react';
import StatusBadge from './StatusBadge.jsx';
import ProgressBar from './ProgressBar.jsx';
import { useDownloads } from '../hooks/useDownloads.js';
import { useDesktopAPI } from '../hooks/useDesktopAPI.js';
import { formatBytes, formatSpeed, formatEta, formatDate, hostOf } from '../services/format.js';

export default function DownloadCard({ d }) {
  const { start, pause, resume, cancel, remove } = useDownloads();
  const desk = useDesktopAPI();
  const live = d.status === 'downloading' || d.status === 'analyzing';
  const showBar = ['downloading', 'analyzing', 'paused'].includes(d.status);

  const buttons = {
    pending: [['Start', () => start(d.id), 'btn-primary'], ['Remove', () => remove(d.id)]],
    analyzing: [['Cancel', () => cancel(d.id), 'btn-danger']],
    downloading: [['Pause', () => pause(d.id)], ['Cancel', () => cancel(d.id), 'btn-danger']],
    paused: [['Resume', () => resume(d.id), 'btn-primary'], ['Cancel', () => cancel(d.id), 'btn-danger']],
    failed: [['Retry', () => start(d.id), 'btn-primary'], ['Remove', () => remove(d.id)]],
    cancelled: [['Retry', () => start(d.id)], ['Remove', () => remove(d.id)]],
    completed: [['Open file', () => desk.openFile(d.outputPath), 'btn-primary'], ['Open folder', () => desk.showInFolder(d.outputPath)], ['Remove', () => remove(d.id)]],
  }[d.status] || [];

  return (
    <div className="card page-enter flex gap-4 p-4">
      <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-line/40">
        {d.thumbnail && <img src={d.thumbnail} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold" title={d.title || d.url}>{d.title || d.url}</h3>
          <StatusBadge status={d.status} />
        </div>
        <p className="truncate text-xs text-muted">{d.source || hostOf(d.url)} · {d.format.toUpperCase()} · {d.quality === 'best' ? 'Best' : `${d.quality}p`} · {formatDate(d.completedAt || d.createdAt)}</p>
        {showBar && (
          <div className="mt-2 space-y-1">
            <ProgressBar value={d.progress} status={d.status} />
            <div className="flex justify-between text-xs text-muted">
              <span>{d.status === 'analyzing' ? 'Reading video information…' : `${d.progress.toFixed(1)}% · ${formatBytes(d.downloadedBytes)} of ${formatBytes(d.fileSize)}`}</span>
              <span>{live && d.status === 'downloading' ? `${formatSpeed(d.speed)} · ETA ${formatEta(d.eta)}` : ''}</span>
            </div>
          </div>
        )}
        {d.status === 'completed' && <p className="mt-1 text-xs text-muted">{formatBytes(d.fileSize)}</p>}
        {d.errorMessage && <p className={`mt-1 text-xs ${d.status === 'failed' ? 'text-red-500' : 'text-amber-500'}`}>{d.errorMessage}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-stretch justify-center gap-1.5">
        {buttons.map(([label, fn, cls]) => <button key={label} className={`btn ${cls || ''}`} onClick={fn}>{label}</button>)}
      </div>
    </div>
  );
}
