'use strict';
const { execFile } = require('child_process');
const { AppError, classifyYtDlpError } = require('../utils/errors');

const TIMEOUT_MS = 60_000;

/** Reads metadata + formats with `yt-dlp -J`. No download happens here. */
class VideoInfoService {
  constructor({ ffmpegService }) { this.tools = ffmpegService; }

  analyze(url) {
    const bin = this.tools.ytDlpPath();
    if (!bin) return Promise.reject(new AppError('YTDLP_MISSING', 'The download engine (yt-dlp) is missing. Reinstall the app or run the prepare-binaries script.', 503));
    // "--" stops yt-dlp from ever treating the URL as an option. execFile uses no shell.
    const args = ['-J', '--no-playlist', '--no-warnings', '--socket-timeout', '20', '--', url];
    return new Promise((resolve, reject) => {
      execFile(bin, args, { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') return reject(new AppError('YTDLP_MISSING', 'The download engine (yt-dlp) is missing.', 503));
          if (err.killed) return reject(new AppError('NETWORK', 'The website took too long to respond. Try again.', 504, true));
          return reject(classifyYtDlpError(stderr || err.message));
        }
        try { resolve(VideoInfoService.normalize(JSON.parse(stdout))); }
        catch (e) { reject(e instanceof AppError ? e : new AppError('UNKNOWN', 'The website returned information the app could not read.', 502)); }
      });
    });
  }

  static normalize(info) {
    if (info && info._type === 'playlist' && Array.isArray(info.entries) && info.entries[0]) info = info.entries[0];
    const all = Array.isArray(info.formats) ? info.formats : [];
    const usable = all.filter((f) => !(f.vcodec === 'none' && f.acodec === 'none') && f.format_note !== 'storyboard' && f.ext !== 'mhtml');
    if (usable.length && usable.every((f) => f.has_drm)) throw new AppError('DRM', 'This video is copy-protected (DRM) and cannot be downloaded.', 422);

    const formats = usable.filter((f) => !f.has_drm).map((f) => ({
      formatId: String(f.format_id), ext: f.ext, height: f.height || null, fps: f.fps || null,
      resolution: f.resolution || (f.height ? `${f.width || '?'}x${f.height}` : 'audio'),
      vcodec: f.vcodec && f.vcodec !== 'none' ? f.vcodec : null, acodec: f.acodec && f.acodec !== 'none' ? f.acodec : null,
      filesize: f.filesize || f.filesize_approx || null,
      kind: f.vcodec === 'none' ? 'audio' : f.acodec === 'none' ? 'video' : 'combined',
    }));
    const heights = [...new Set(formats.filter((f) => f.height).map((f) => f.height))].sort((a, b) => b - a);
    const bestSize = formats.filter((f) => f.filesize).sort((a, b) => b.filesize - a.filesize)[0];
    return {
      title: info.title || 'Untitled video', thumbnail: info.thumbnail || null, source: info.extractor_key || info.extractor || null,
      webpageUrl: info.webpage_url || null, duration: Number.isFinite(info.duration) ? Math.round(info.duration) : null,
      uploader: info.uploader || null, heights, formats,
      videoExtensions: [...new Set(formats.filter((f) => f.kind !== 'audio').map((f) => f.ext))],
      audioExtensions: [...new Set(formats.filter((f) => f.kind === 'audio').map((f) => f.ext))],
      estimatedSize: bestSize ? bestSize.filesize : null,
    };
  }
}

module.exports = { VideoInfoService };
