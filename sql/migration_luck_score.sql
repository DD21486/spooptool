-- Luck meter: one score per character, -100 to +100. Run after schema.sql.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS luck_score INT NOT NULL DEFAULT 0;

ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS chk_luck_score_range;
ALTER TABLE characters
  ADD CONSTRAINT chk_luck_score_range CHECK (luck_score >= -100 AND luck_score <= 100);

COMMENT ON COLUMN characters.luck_score IS 'Luck meter: -100 (unlucky) to +100 (lucky), 0 = normal. Updated by boss drops in POST /api/loot.';
