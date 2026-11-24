'use strict';
const { spawn } = require('child_process');
const readline = require('readline');
const { AppError, classifyYtDlpError } = require('../utils/errors');

const PROG = '__PROG__';
const FILE = '__FILE__';
const PROGRESS_TEMPLATE =
  `download:${PROG}%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s`;

const num = (v) => { const n = Number(v); return v === 'NA' || v === '' || !Number.isFinite(n) ? null : n; };

/** Parses one progress line emitted by yt-dlp. Returns null for any other line. */
function parseProgressLine(line) {
  const i = line.indexOf(PROG);
  if (i === -1) return null;
  const [status, downloaded, total, estimate, speed, eta] = line.slice(i + PROG.length).trim().split('|');
  const d = num(downloaded), t = num(total) ?? num(estimate);
  return { status, downloadedBytes: d ?? 0, totalBytes: t, speed: num(speed) ?? 0, eta: num(eta),
    percent: d != null && t ? Math.min(100, (d / t) * 100) : null };
}

/** Builds the yt-dlp format-selection arguments. All values come from validated enums. */
function formatArgs(format, quality) {
  if (format === 'mp3' || format === 'm4a') return ['-f', 'ba/b', '-x', '--audio-format', format, '--audio-quality', '0'];
  const h = /^\d+$/.test(quality) ? `[height<=${quality}]` : '';
  if (format === 'webm') return ['-f', `bv*${h}[ext=webm]+ba[ext=webm]/bv*${h}+ba/b${h}`, '--merge-output-format', 'webm'];
  return ['-f', `bv*${h}[ext=mp4]+ba[ext=m4a]/bv*${h}+ba/b${h}`, '--merge-output-format', 'mp4'];
}

function buildArgs({ url, format, quality, outputDir, ffmpegDir }) {
  const args = [
    '--no-playlist', '--no-warnings', '--newline', '--progress', '--progress-template', PROGRESS_TEMPLATE,
    '--print', `before_dl:${FILE}%(filename)s`, '--print', `after_move:${FILE}%(filepath)s`,
    '--continue', '--retries', '5', '--fragment-retries', '5', '--socket-timeout', '30',
    '--windows-filenames', '--trim-filenames', '150',
    '-P', outputDir, '-o', '%(title).150B [%(id)s].%(ext)s',
    ...formatArgs(format, quality),
  ];
  if (ffmpegDir) args.push('--ffmpeg-location', ffmpegDir);
  args.push('--', url); // "--" prevents option injection through the URL
  return args;
}

/** Kills a process and all of its children (yt-dlp spawns ffmpeg). */
function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
    setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 3000).unref();
  }
}

class DownloadService {
  constructor({ ffmpegService }) { this.tools = ffmpegService; }

  /**
   * Starts one yt-dlp process. Returns { stop(), done } where `done` resolves with
   * { code, signal, filePath, error } (error is a classified AppError when code !== 0 and not stopped).
   */
  start(task, outputDir, { onProgress, onFile }) {
    const bin = this.tools.ytDlpPath();
    if (!bin) throw new AppError('YTDLP_MISSING', 'The download engine (yt-dlp) is missing. Reinstall the app or run the prepare-binaries script.', 503);

    const args = buildArgs({ url: task.url, format: task.format, quality: task.quality, outputDir, ffmpegDir: this.tools.ffmpegDir() });
    // No shell: arguments are passed as an array, so nothing can be interpreted as a command.
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let filePath = null;
    let stopped = false;
    let tail = '';
    let doneBytes = 0; // bytes of streams already finished (video, then audio)

    // In quiet mode yt-dlp sends progress to stderr and --print output to stdout, so read both.
    const onLine = (line, isErr) => {
      if (line.includes(FILE)) {
        const p = line.slice(line.indexOf(FILE) + FILE.length).trim();
        if (p && p !== 'NA') { filePath = p; onFile && onFile(p); }
        return;
      }
      const prog = parseProgressLine(line);
      if (prog) {
        if (prog.status === 'finished') { doneBytes += prog.downloadedBytes; return; }
        onProgress && onProgress({ ...prog, downloadedBytes: doneBytes + prog.downloadedBytes,
          totalBytes: prog.totalBytes ? doneBytes + prog.totalBytes : null });
        return;
      }
      if (isErr) tail = (tail + '\n' + line).slice(-4000);
    };
    readline.createInterface({ input: child.stdout }).on('line', (l) => onLine(l, false));
    readline.createInterface({ input: child.stderr }).on('line', (l) => onLine(l, true));

    const done = new Promise((resolve) => {
      child.once('error', (err) => resolve({ code: -1, signal: null, filePath, stopped,
        error: err.code === 'ENOENT' ? new AppError('YTDLP_MISSING', 'The download engine (yt-dlp) is missing.', 503) : classifyYtDlpError(err.message) }));
      child.once('close', (code, signal) => resolve({ code, signal, filePath, stopped,
        error: code === 0 || stopped ? null : classifyYtDlpError(tail) }));
    });

    return { pid: child.pid, done, stop: () => { stopped = true; killTree(child); } };
  }
}

module.exports = { DownloadService, parseProgressLine, buildArgs, formatArgs, killTree };
