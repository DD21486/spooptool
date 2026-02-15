-- Run in Neon SQL Editor after schema.sql.
-- Adds table for historical character snapshots (skills + bosses) for progress-over-time and insights.

CREATE TABLE IF NOT EXISTS character_snapshots (
  id BIGSERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL
);

-- Index for "snapshots for this character, newest first" (e.g. progress over time)
CREATE INDEX IF NOT EXISTS idx_character_snapshots_character_at
  ON character_snapshots (character_id, at DESC);

-- Optional: index for time-range queries across all characters
CREATE INDEX IF NOT EXISTS idx_character_snapshots_at
  ON character_snapshots (at DESC);

COMMENT ON TABLE character_snapshots IS 'Periodic Hiscores snapshots per character; data = { skills: {...}, bosses: {...} } for charts and XP deltas';
