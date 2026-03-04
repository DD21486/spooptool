-- SpoopScore snapshots at noon and 8pm (in configurable TZ) for "SpoopScore over time" chart.
-- Run after migration_character_snapshots.sql.

CREATE TABLE IF NOT EXISTS spoopscore_snapshots (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  at_slot TIMESTAMPTZ NOT NULL,
  spoop_score NUMERIC NOT NULL DEFAULT 0,
  boss_score NUMERIC NOT NULL DEFAULT 0,
  skill_score NUMERIC NOT NULL DEFAULT 0,
  pet_points NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, at_slot)
);

CREATE INDEX IF NOT EXISTS idx_spoopscore_snapshots_character_at
  ON spoopscore_snapshots (character_id, at_slot DESC);

COMMENT ON TABLE spoopscore_snapshots IS 'SpoopScore per character per 6-hour UTC slot (0, 6, 12, 18). Filled by /api/cron/snapshot for 7-day chart.';
