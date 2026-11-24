import React from 'react';
import QualitySelector from './QualitySelector.jsx';
import { formatBytes, formatDuration } from '../services/format.js';

export default function VideoPreview({ info, format, quality, onChange, onStart, busy }) {
  const videoFormats = info.videoExtensions.length ? info.videoExtensions.join(', ').toUpperCase() : '—';
  const audioFormats = info.audioExtensions.length ? info.audioExtensions.join(', ').toUpperCase() : '—';
  return (
    <div className="card page-enter overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="h-24 w-40 shrink-0 overflow-hidden rounded-lg bg-line/40">
          {info.thumbnail && <img src={info.thumbnail} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold" title={info.title}>{info.title}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div className="flex gap-2"><dt className="text-muted">Source</dt><dd>{info.source || '—'}</dd></div>
            <div className="flex gap-2"><dt className="text-muted">Duration</dt><dd>{formatDuration(info.duration)}</dd></div>
            <div className="flex gap-2"><dt className="text-muted">Resolutions</dt><dd>{info.heights.length ? info.heights.map((h) => `${h}p`).join(', ') : '—'}</dd></div>
            <div className="flex gap-2"><dt className="text-muted">Est. size</dt><dd>{formatBytes(info.estimatedSize)}</dd></div>
            <div className="flex gap-2"><dt className="text-muted">Video</dt><dd>{videoFormats}</dd></div>
            <div className="flex gap-2"><dt className="text-muted">Audio</dt><dd>{audioFormats}</dd></div>
          </dl>
        </div>
      </div>
      <div className="flex items-end gap-4 border-t border-line p-4">
        <div className="flex-1"><QualitySelector heights={info.heights} format={format} quality={quality} onChange={onChange} /></div>
        <button className="btn btn-primary h-9 px-5" onClick={onStart} disabled={busy}>Start download</button>
      </div>
    </div>
  );
}
