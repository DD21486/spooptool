-- Location sharing (Live Location Sharing plugin compatible).
-- Run in Neon SQL Editor once.
CREATE TABLE IF NOT EXISTS location_updates (
  name VARCHAR(12) NOT NULL PRIMARY KEY,
  x INT NOT NULL,
  y INT NOT NULL,
  plane INT NOT NULL,
  world INT NOT NULL,
  type VARCHAR(32) DEFAULT '',
  title VARCHAR(64) DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional: index for pruning stale rows (updated_at)
CREATE INDEX IF NOT EXISTS idx_location_updates_updated_at ON location_updates (updated_at);
