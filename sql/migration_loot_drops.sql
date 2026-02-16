-- Run in Neon SQL Editor after schema.sql and character_snapshots.
-- Stores loot drops (e.g. from DINK webhook or Discord bot) for "Loot this week" etc.

CREATE TABLE IF NOT EXISTS loot_drops (
  id BIGSERIAL PRIMARY KEY,
  character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  username VARCHAR(12) NOT NULL,
  item_id INT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  total_value_gp BIGINT NOT NULL,
  source VARCHAR(128),
  kill_count INT,
  rarity_text VARCHAR(64),
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loot_drops_username_at
  ON loot_drops (username, at DESC);

CREATE INDEX IF NOT EXISTS idx_loot_drops_character_at
  ON loot_drops (character_id, at DESC)
  WHERE character_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_loot_drops_at
  ON loot_drops (at DESC);

COMMENT ON TABLE loot_drops IS 'Loot drop events from DINK/Discord; used for per-player and per-week totals';
