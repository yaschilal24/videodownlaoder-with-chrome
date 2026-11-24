#!/usr/bin/env bash
# Video Downloader Pro – helper script (Git Bash on Windows, WSL, macOS, Linux).
# Usage:  bash setup.sh [setup|dev|start|test|build|help]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/desktop-app"

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

check_node() {
  command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node.js 22+ from https://nodejs.org, then reopen the terminal."
  local major; major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 22 ] || fail "Node.js 22 or newer is required (found $(node -v))."
  command -v npm >/dev/null 2>&1 || fail "npm was not found. Reinstall Node.js."
  echo "Node $(node -v), npm $(npm -v)"
}

is_windows() { case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac; }

ensure_installed() {
  [ -d "$APP/node_modules/electron" ] || fail "Dependencies are not installed yet. Run:  bash setup.sh setup"
}

cmd_setup() {
  check_node
  say "Installing dependencies (a few minutes)…"
  ( cd "$APP" && npm install )
  say "Downloading yt-dlp and copying FFmpeg into desktop-app/bin…"
  if is_windows; then
    node "$ROOT/scripts/prepare-binaries.js"
  else
    echo "Not Windows: the script fetches yt-dlp.exe (Windows build). Install yt-dlp and ffmpeg with your package manager instead; the app finds them on PATH."
    node "$ROOT/scripts/prepare-binaries.js" || true
  fi
  say "Setup finished. Next:  bash setup.sh dev"
}

cmd_dev()   { check_node; ensure_installed; say "Starting the app (Ctrl+C to stop)…"; cd "$APP" && npm run dev; }
cmd_start() { check_node; ensure_installed; say "Building and starting…"; cd "$APP" && npm start; }
cmd_test()  { check_node; ensure_installed; say "Running tests…"; cd "$APP" && npm test; }
cmd_build() { check_node; ensure_installed; say "Building the Windows installer (run this on Windows)…"; cd "$APP" && npm run dist; echo "Installer: $APP/release/VideoDownloaderPro-Setup.exe"; }

cmd_help() {
  cat <<'USAGE'
bash setup.sh setup   Install npm packages + yt-dlp + FFmpeg (run once)
bash setup.sh dev     Run the app in development mode
bash setup.sh start   Build the UI and run the app
bash setup.sh test    Run the automated tests
bash setup.sh build   Build VideoDownloaderPro-Setup.exe (Windows)
USAGE
}

case "${1:-help}" in
  setup) cmd_setup ;;
  dev)   cmd_dev ;;
  start) cmd_start ;;
  test)  cmd_test ;;
  build) cmd_build ;;
  help|-h|--help) cmd_help ;;
  *) cmd_help; exit 1 ;;
esac
