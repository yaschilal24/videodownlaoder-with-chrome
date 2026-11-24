import React from 'react';

const COLORS = { downloading: 'bg-accent', analyzing: 'bg-sky-500', paused: 'bg-amber-500', completed: 'bg-emerald-500', failed: 'bg-red-500' };

export default function ProgressBar({ value = 0, status = 'downloading' }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line/60" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-[width] duration-300 ${COLORS[status] || 'bg-accent'} ${status === 'analyzing' ? 'animate-pulse' : ''}`} style={{ width: `${status === 'analyzing' ? 100 : pct}%` }} />
    </div>
  );
}
