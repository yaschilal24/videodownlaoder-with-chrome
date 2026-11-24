import React, { useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import { useDesktopAPI } from '../hooks/useDesktopAPI.js';

export default function About() {
  const desk = useDesktopAPI();
  const [info, setInfo] = useState(null);
  useEffect(() => { desk.getAppInfo().then(setInfo); }, []);
  return (
    <div className="page-enter max-w-2xl">
      <Header title="About" />
      <div className="card space-y-3 p-5 text-sm">
        <div className="flex items-center gap-3"><img src="./icon.png" alt="" className="h-12 w-12 rounded-xl" /><div><div className="text-lg font-semibold">Video Downloader Pro</div><div className="text-muted">Version {info?.version ?? '…'}</div></div></div>
        <dl className="grid grid-cols-2 gap-y-1 text-xs"><dt className="text-muted">Electron</dt><dd>{info?.electron}</dd><dt className="text-muted">Chromium</dt><dd>{info?.chrome}</dd><dt className="text-muted">Node.js</dt><dd>{info?.node}</dd><dt className="text-muted">Data folder</dt><dd className="break-all">{info?.userDataPath}</dd></dl>
        <p className="text-muted">Powered by yt-dlp and FFmpeg. Please download only content you own or are permitted to download, and respect each website's terms and copyright law. Video Downloader Pro never bypasses DRM, paywalls or login requirements.</p>
      </div>
    </div>
  );
}
