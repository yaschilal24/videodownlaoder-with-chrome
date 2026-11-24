-- Version 2: live-progress details, history metadata, and extra settings.
ALTER TABLE downloads ADD COLUMN downloaded_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE downloads ADD COLUMN eta INTEGER;
ALTER TABLE downloads ADD COLUMN source TEXT;
ALTER TABLE downloads ADD COLUMN duration INTEGER;
ALTER TABLE settings  ADD COLUMN start_with_windows INTEGER NOT NULL DEFAULT 0 CHECK (start_with_windows IN (0,1));
ALTER TABLE settings  ADD COLUMN auto_open_folder   INTEGER NOT NULL DEFAULT 0 CHECK (auto_open_folder IN (0,1));
