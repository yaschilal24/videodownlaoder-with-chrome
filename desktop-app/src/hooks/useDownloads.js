import { useContext, useMemo } from 'react';
import { DownloadContext } from '../context/DownloadContext.jsx';

export function useDownloads() {
  const ctx = useContext(DownloadContext);
  if (!ctx) throw new Error('useDownloads must be used inside <DownloadProvider>');
  const { downloads } = ctx;
  const derived = useMemo(() => ({
    current: downloads.filter((d) => !['completed', 'failed', 'cancelled'].includes(d.status)),
    history: downloads.filter((d) => ['completed', 'failed', 'cancelled'].includes(d.status)),
    completed: downloads.filter((d) => d.status === 'completed'),
  }), [downloads]);
  return { ...ctx, ...derived };
}
