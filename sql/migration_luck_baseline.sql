-- Luck baseline: KC per (character, boss) at "start tracking" so effective KC = drop KC - baseline. Run after migration_luck_score.sql.

CREATE TABLE IF NOT EXISTS luck_baseline (
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  boss_key VARCHAR(128) NOT NULL,
  kill_count INT NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (character_id, boss_key)
);

CREATE INDEX IF NOT EXISTS idx_luck_baseline_character_boss
  ON luck_baseline (character_id, LOWER(boss_key));

COMMENT ON TABLE luck_baseline IS 'Boss KC at baseline; effective KC for luck = drop kill_count - baseline. Set via cron ?set_luck_baseline=1 or one-off script.';
