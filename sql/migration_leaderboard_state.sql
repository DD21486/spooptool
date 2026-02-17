-- Stores current leaderboard state so we can detect when the boss-kill leader changes.
-- Run after schema. Updated by snapshot cron; used to send Discord notification on overtake.

CREATE TABLE IF NOT EXISTS leaderboard_state (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE leaderboard_state IS 'Key-value for cron: e.g. boss_kill_leader = username. Used to notify Discord when leader changes.';
