import React from 'react';

const STYLES = {
  pending: 'bg-slate-500/15 text-slate-400', analyzing: 'bg-sky-500/15 text-sky-500', downloading: 'bg-indigo-500/15 text-indigo-400',
  paused: 'bg-amber-500/15 text-amber-500', completed: 'bg-emerald-500/15 text-emerald-500', failed: 'bg-red-500/15 text-red-500',
  cancelled: 'bg-slate-500/15 text-slate-400',
};
const LABELS = { pending: 'Pending', analyzing: 'Analyzing', downloading: 'Downloading', paused: 'Paused', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' };

export default function StatusBadge({ status }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] || STYLES.pending}`}>{LABELS[status] || status}</span>;
}
