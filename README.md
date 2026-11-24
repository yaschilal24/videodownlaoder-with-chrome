# Video Downloader Pro

Windows desktop app (Electron + React + Express + SQLite) with a Chrome extension (Manifest V3).
Downloads use **yt-dlp** and **FFmpeg** for supported, authorized sources only. DRM, paywalls and login restrictions are never bypassed.

```
Chrome page → Extension popup → POST /api/download/receive → Desktop (Analyze) → Queue → yt-dlp (+FFmpeg) → saved file
```

## 1. Requirements (Windows 10/11 x64)
- Node.js **22.13 or newer** (Node 24 works; the database uses Node's built-in SQLite) – https://nodejs.org (includes npm)
- Google Chrome 120+
- Internet access during setup (downloads npm packages and `yt-dlp.exe`)

## 2. Install
Quick way (Git Bash / WSL / VS Code bash terminal): `bash setup.sh setup`, then `bash setup.sh dev`. Other commands: `test`, `start`, `build`.

PowerShell way, from the project root:
```powershell
node scripts/install-dependencies.js
```
This runs `npm install` in `desktop-app` (installs Electron, React, Vite, Tailwind and Express; there are no native modules, so no C++ compiler is needed),
then `scripts/prepare-binaries.js`, which downloads `yt-dlp.exe` (SHA-256 verified against the official release checksums) and copies FFmpeg from the `ffmpeg-static` package into `desktop-app/bin`.

Manual equivalent:
```powershell
cd desktop-app
npm install
cd ..
node scripts/prepare-binaries.js
```

## 3. Run
```powershell
cd desktop-app
npm run dev      # Vite dev server + Electron (hot reload)
npm start        # build renderer then run Electron on the built files
npm test         # automated backend tests (see section 8)
```

## 4. Install the Chrome extension
1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → choose the `chrome-extension` folder.
3. In the desktop app open **Settings → Chrome extension → Generate pairing code**.
4. Click the extension icon, type the 6-digit code, press **Pair** (one time only).
5. On any video page click the extension → **Send to Desktop**. The app receives the link; press **Analyze**, choose quality, **Start download**.

The extension icon badge shows `!` (app not running), `?` (not paired) or nothing (connected). It reconnects automatically (background alarm every 30 s) when the app starts.
**Open Downloader** focuses the app, or launches it through the `vdp://` protocol registered by the installer.

## 5. Build the Windows installer
```powershell
cd desktop-app
npm run dist
```
Output: `desktop-app/release/VideoDownloaderPro-Setup.exe` (NSIS; choose install folder, desktop + Start-menu shortcuts, uninstaller, bundled yt-dlp/FFmpeg in `resources/bin`, registers `vdp://`). Run `prepare-binaries.js` first so `desktop-app/bin` is populated.
Building on Windows is recommended. The installer is unsigned, so SmartScreen may warn; code-signing needs a certificate.

## 6. Architecture
| Part | Where |
|---|---|
| Electron main, window, IPC, preload | `desktop-app/electron/` |
| REST API (Express, loopback only) | `desktop-app/backend/` (`routes`, `controllers`, `middleware`) |
| Engine | `services/DownloadService.js` (spawns yt-dlp), `VideoInfoService.js`, `FFmpegService.js`, `QueueService.js`, `FileService.js` |
| SQLite | `backend/database/` (`schema.sql` = v1, `migrations/002_*.sql`), file `%APPDATA%\Video Downloader Pro\downloads.db` |
| React UI | `desktop-app/src/` |
| Extension | `chrome-extension/` |

**Progress** is parsed from yt-dlp's own progress output and pushed to the UI via Electron IPC – nothing is simulated.
**Pause** stops the yt-dlp process tree; **Resume** restarts it and yt-dlp continues from its `.part` file.
**Restart recovery:** tasks that were downloading/analyzing when the app closed become *Paused* ("Interrupted…") and are never restarted automatically.
**Retries:** network errors retry up to 3 times with back-off; yt-dlp also retries internally.

API: `GET /api/health` (public) · `POST /api/pair` (extension only) · everything else needs the pairing token:
`POST /api/download/receive`, `GET /api/downloads`, `GET /api/downloads/:id`, `POST /api/downloads/:id/{start|pause|resume|cancel}`, `DELETE /api/downloads/:id`, `POST /api/video/analyze`, `GET|PUT /api/settings`, plus `POST /api/downloads`, `POST /api/settings/reset`, `GET /api/stats`, `GET /api/ping`, `POST /api/app/focus`.

## 7. Security model
- `contextIsolation`, no `nodeIntegration`, `sandbox`, CSP, navigation/`window.open` blocked, all browser permissions denied; the renderer only sees a narrow `window.desktop` API and every IPC call checks the sender.
- Opening/revealing files is limited to paths inside the configured download folder.
- The API binds to `127.0.0.1` only; it checks the **Host** (anti DNS-rebinding), the **Origin** (app or `chrome-extension://`) and a 256-bit **pairing token** (constant-time compare). The token is only handed out in exchange for a one-time 6-digit code (valid 2 min, rate-limited).
- URLs: http(s) only, no credentials, no localhost/private-network targets, passed to yt-dlp after `--` with `spawn` (no shell). Output paths are validated (absolute, not a drive root or system folder); filenames are sanitised by yt-dlp (`--windows-filenames`).

## 8. Tests
`npm test` (in `desktop-app`) runs `tests/*.test.js` with Node's built-in runner: URL/path validation, security guards, pairing, REST endpoints, SQLite schema/migrations/constraints, progress parsing, queue (progress events, status changes, pause/resume, cancel + cleanup, retries, concurrency, duplicate prevention, disk-space and missing-binary errors, restart recovery), and the full Extension → Receiver → Analyzer → Queue → Engine → saved-file workflow.

**Important:** the engine tests use a small stand-in for yt-dlp (`tests/fixtures/fake-yt-dlp.js`) because real downloads need internet access to video sites. They prove the app's queue, progress parsing and process control work; they do **not** prove that any particular website downloads successfully. Those engine tests run on Linux/macOS/WSL (they are skipped on native Windows). The Electron window, Chrome popup, and NSIS installer were not run in the test environment – verify them with the checklist below.

### Manual verification checklist
1. `npm run dev` → window opens, Dashboard shows Chrome extension status.
2. Paste a public video link you are allowed to download → Analyze → Start → progress moves → file appears in the download folder → **Open file / Open folder** work.
3. Pair the extension, press **Send to Desktop** on a video page → banner appears in the app.
4. Pause / Resume / Cancel; close the app mid-download and reopen → task is *Paused*, Resume continues.
5. Settings: change folder/theme/concurrency; **Reset settings**.

## 9. Troubleshooting
| Problem | Fix |
|---|---|
| "The local service failed to start (port 47615 in use)" | Close other copies of the app or the program using port 47615 (`netstat -ano \| findstr 47615`). |
| Extension says **Desktop app not running** | Start Video Downloader Pro, or press **Open Downloader**. |
| Extension says **Not paired** / "Pairing expired" | Settings → Generate pairing code → enter it in the popup. Codes last 2 minutes. |
| "yt-dlp is missing" | Run `node scripts/prepare-binaries.js` (dev) or reinstall the app. |
| "FFmpeg is missing" | Same as above; FFmpeg is needed to merge video+audio and for MP3/M4A. |
| Downloads fail on a site that used to work | yt-dlp is outdated (Settings shows a warning). Re-run `prepare-binaries.js` to fetch the latest. |
| "needs a login, membership or payment" | The app does not bypass access restrictions. |
| "Not enough disk space" / permission errors | Choose another folder in Settings (avoid system folders). |
| `EBUSY` / locked files during `npm install` | Close Explorer windows and antivirus scans on the folder, delete `desktop-app/node_modules`, move the project to a short path such as `C:\vdp`, and run setup again. |
| `node:sqlite` not found | Use Node 22.13 or newer (Node 24 works). |
| `Open Downloader` does nothing | The `vdp://` protocol is registered by the installed app (or on first run of `npm start`); Chrome may ask for permission. |
| Logs | `%APPDATA%\Video Downloader Pro\logs\app.log` |
| Database problem | Close the app, rename `downloads.db` (history is lost), restart. |
