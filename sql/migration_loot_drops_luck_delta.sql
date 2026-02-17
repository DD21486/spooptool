-- Add luck_delta to loot_drops so we can show (+N) / (-N) in the loot table.
-- Run after migration_loot_drops.sql (and migration_loot_drops_item_id.sql if used).

ALTER TABLE loot_drops
  ADD COLUMN IF NOT EXISTS luck_delta INT NULL;

COMMENT ON COLUMN loot_drops.luck_delta IS 'Change applied to character luck_score for this drop event (+N lucky, -N unlucky). Null if drop did not affect luck.';
