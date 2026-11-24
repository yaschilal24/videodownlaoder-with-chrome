'use strict';

class AppError extends Error {
  constructor(code, message, status = 400, recoverable = false) {
    super(message);
    this.code = code; this.status = status; this.recoverable = recoverable;
  }
}

// Ordered: first match wins. Messages are written for non-technical users.
const RULES = [
  [/no space left|ENOSPC|disk full/i, 'DISK_FULL', 'There is not enough free disk space. Free some space or choose another folder.', false],
  [/permission denied|EACCES|EPERM|access is denied/i, 'PERMISSION', 'The app is not allowed to write to the download folder. Choose a different folder in Settings.', false],
  [/ffmpeg.*(not found|not installed)|ffprobe.*not found|Postprocessing.*ffmpeg/i, 'FFMPEG_MISSING', 'FFmpeg is missing, so the video and audio could not be combined. Reinstall the app or run the prepare-binaries script.', false],
  [/unsupported url/i, 'UNSUPPORTED', 'This website or link is not supported.', false],
  [/drm/i, 'DRM', 'This video is copy-protected (DRM) and cannot be downloaded.', false],
  [/sign in|log ?in|members[- ]only|private video|age[- ]restricted|confirm you.{0,4}re not a bot|authentication|premium|subscribe|paywall/i, 'AUTH_REQUIRED', 'This video needs a login, membership or payment. Video Downloader Pro does not bypass access restrictions.', false],
  [/video unavailable|not available|has been removed|does not exist|404|not found|geo[- ]?restrict|blocked in your country/i, 'UNAVAILABLE', 'This video is unavailable. It may be private, removed or blocked in your region.', false],
  [/timed out|timeout|connection (reset|refused|aborted)|network is unreachable|getaddrinfo|name resolution|remote end closed|HTTP Error 5\d\d|HTTP Error 429|incomplete read|unable to download|ECONNRESET|ETIMEDOUT|ENOTFOUND/i, 'NETWORK', 'The connection was interrupted. Check your internet connection and try again.', true],
];

function classifyYtDlpError(stderr = '') {
  const text = String(stderr);
  for (const [re, code, message, recoverable] of RULES) {
    if (re.test(text)) return new AppError(code, message, 422, recoverable);
  }
  const last = text.trim().split(/\r?\n/).filter(Boolean).pop() || 'The download failed.';
  return new AppError('UNKNOWN', `The download failed: ${last.replace(/^ERROR:\s*/i, '').slice(0, 200)}`, 422, false);
}

module.exports = { AppError, classifyYtDlpError };
