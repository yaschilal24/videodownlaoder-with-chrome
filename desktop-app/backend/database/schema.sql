-- Base schema (version 1). Later changes live in migrations/NNN_*.sql.
CREATE TABLE IF NOT EXISTS downloads (
  id            TEXT PRIMARY KEY,
  url           TEXT NOT NULL,
  title         TEXT,
  thumbnail     TEXT,
  format        TEXT NOT NULL DEFAULT 'mp4'  CHECK (format IN ('mp4','webm','mp3','m4a')),
  quality       TEXT NOT NULL DEFAULT 'best' CHECK (quality IN ('best','2160','1440','1080','720','480','360')),
  output_path   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','analyzing','downloading','paused','completed','failed','cancelled')),
  progress      REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  speed         REAL NOT NULL DEFAULT 0,          -- bytes per second
  file_size     INTEGER,                          -- bytes
  created_at    TEXT NOT NULL,
  completed_at  TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_downloads_status  ON downloads(status);
CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_downloads_url     ON downloads(url);

CREATE TABLE IF NOT EXISTS settings (
  id                       INTEGER PRIMARY KEY CHECK (id = 1),   -- single-row table
  download_directory       TEXT    NOT NULL,
  max_concurrent_downloads INTEGER NOT NULL DEFAULT 3 CHECK (max_concurrent_downloads BETWEEN 1 AND 10),
  default_quality          TEXT    NOT NULL DEFAULT 'best' CHECK (default_quality IN ('best','2160','1440','1080','720','480','360')),
  default_format           TEXT    NOT NULL DEFAULT 'mp4'  CHECK (default_format IN ('mp4','webm','mp3','m4a')),
  theme                    TEXT    NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark','light')),
  notifications_enabled    INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0,1))
);
