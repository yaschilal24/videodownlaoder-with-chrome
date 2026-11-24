import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';

export const DownloadContext = createContext(null);

export function DownloadProvider({ children }) {
  const [downloads, setDownloads] = useState([]);
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState(null);
  const [incoming, setIncoming] = useState(null); // task received from the Chrome extension
  const [toasts, setToasts] = useState([]);
  const [fatal, setFatal] = useState(null);
  const statsTimer = useRef(null);

  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  const refreshStats = useCallback(() => {
    clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(() => api.stats().then(setStats).catch(() => {}), 200);
  }, []);

  const upsert = useCallback((d) => setDownloads((list) => {
    const i = list.findIndex((x) => x.id === d.id);
    if (i === -1) return [d, ...list];
    const next = list.slice(); next[i] = { ...list[i], ...d }; return next;
  }), []);

  // Initial load + periodic stats (connection status, disk space).
  useEffect(() => {
    (async () => {
      try {
        const [list, s, st] = await Promise.all([api.list(), api.getSettings(), api.stats()]);
        setDownloads(list); setSettings(s); setStats(st);
      } catch (e) { setFatal(e.message); }
    })();
    const t = setInterval(() => api.stats().then(setStats).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  // Real-time events pushed from the main process over IPC (no polling, no fake progress).
  useEffect(() => {
    if (!window.desktop) return undefined;
    const offs = [
      window.desktop.on('download:progress', (p) =>
        setDownloads((list) => list.map((d) => (d.id === p.id ? { ...d, progress: p.progress, speed: p.speed, downloadedBytes: p.downloadedBytes, fileSize: p.fileSize ?? d.fileSize, eta: p.eta } : d)))),
      window.desktop.on('download:status', (e) => {
        if (e.status === 'removed') setDownloads((l) => l.filter((d) => d.id !== e.id)); else if (e.download) upsert(e.download);
        refreshStats();
      }),
      window.desktop.on('extension:url-received', ({ download }) => { upsert(download); setIncoming(download); toast('Link received from Chrome', 'success'); }),
    ];
    return () => offs.forEach((off) => off());
  }, [upsert, refreshStats, toast]);

  useEffect(() => { document.documentElement.classList.toggle('dark', (settings?.theme ?? 'dark') === 'dark'); }, [settings?.theme]);

  const run = useCallback(async (fn, okText) => {
    try { const r = await fn(); if (okText) toast(okText, 'success'); return r; }
    catch (e) { toast(e.message, 'error'); return null; }
  }, [toast]);

  const actions = useMemo(() => ({
    start: (id, sel) => run(() => api.start(id, sel)),
    pause: (id) => run(() => api.pause(id)),
    resume: (id) => run(() => api.resume(id)),
    cancel: (id) => run(() => api.cancel(id)),
    remove: (id) => run(() => api.remove(id)),
    create: (payload) => run(() => api.create(payload)),
    saveSettings: async (patch) => { const s = await run(() => api.updateSettings(patch)); if (s) setSettings((old) => ({ ...old, ...s })); return s; },
    resetSettings: async () => { const s = await run(() => api.resetSettings(), 'Settings reset'); if (s) setSettings((old) => ({ ...old, ...s })); },
    reloadSettings: async () => { const s = await run(() => api.getSettings()); if (s) setSettings(s); },
    dismissIncoming: () => setIncoming(null),
    toast,
  }), [run, toast]);

  const value = { downloads, settings, stats, incoming, toasts, fatal, ...actions };
  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}
