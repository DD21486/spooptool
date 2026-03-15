-- Run in Neon SQL Editor. Adds per-character weekly award win counts and a log to avoid double-awarding.
-- Requires: characters, character_snapshots, loot_drops.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS weekly_xp_wins   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_boss_wins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_loot_wins INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN characters.weekly_xp_wins   IS 'Number of times this character won the weekly XP award (incremented by cron).';
COMMENT ON COLUMN characters.weekly_boss_wins IS 'Number of times this character won the weekly Boss KC award (incremented by cron).';
COMMENT ON COLUMN characters.weekly_loot_wins  IS 'Number of times this character won the weekly Loot award (incremented by cron).';

CREATE TABLE IF NOT EXISTS weekly_awards_log (
  week_end     DATE NOT NULL,
  category     VARCHAR(20) NOT NULL,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  PRIMARY KEY (week_end, category)
);

COMMENT ON TABLE weekly_awards_log IS 'One row per category per week; ensures we only increment character win counts once per week when cron runs.';
