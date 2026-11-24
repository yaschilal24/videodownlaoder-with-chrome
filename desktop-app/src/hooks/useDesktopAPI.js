// Safe wrappers around the preload bridge (window.desktop). Errors become user-friendly toasts.
import { useCallback } from 'react';
import { useDownloads } from './useDownloads.js';

export function useDesktopAPI() {
  const { toast } = useDownloads();
  const guard = useCallback(async (fn, fallback = null) => {
    try { return await fn(window.desktop); } catch (e) { toast(e.message.replace(/^Error invoking remote method '[^']+': Error: /, ''), 'error'); return fallback; }
  }, [toast]);

  return {
    selectDirectory: () => guard((d) => d.selectDirectory()),
    openFile: (p) => guard((d) => d.openPath(p)),
    showInFolder: (p) => guard((d) => d.showItemInFolder(p)),
    openFolder: (p) => guard((d) => d.openPath(p)),
    readClipboard: () => guard((d) => d.readClipboard(), ''),
    newPairingCode: () => guard((d) => d.newPairingCode()),
    setStartWithWindows: (on) => guard((d) => d.setStartWithWindows(on)),
    getAppInfo: () => guard((d) => d.getAppInfo()),
  };
}
