-- Add item_id so we can show OSRS item sprites (20x20) in the loot table.
-- Run after migration_loot_drops.sql.

ALTER TABLE loot_drops
  ADD COLUMN IF NOT EXISTS item_id INT NULL;

COMMENT ON COLUMN loot_drops.item_id IS 'OSRS item id from Dink payload (extra.items[].id) for sprite image';