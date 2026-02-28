-- Fix a single loot drop's value in loot_drops.
-- Run in Neon SQL Editor. Replace the placeholders with your values.

-- 1) Find the row (optional: run this first to get id and confirm it's the right drop)
-- SELECT id, username, item_name, quantity, total_value_gp, source, at
-- FROM loot_drops
-- WHERE username = 'PlayerName'
--   AND item_name ILIKE '%Item Name%'
-- ORDER BY at DESC
-- LIMIT 20;

-- 2) Update by primary key (safest: use the id from the SELECT above)
-- UPDATE loot_drops
-- SET total_value_gp = 1234567
-- WHERE id = 99999;

-- Example: set the drop with id 42 to 5.5M gp
-- UPDATE loot_drops SET total_value_gp = 5500000 WHERE id = 42;

-- Example: fix the most recent drop of "Twisted bow" for user "Spoopspooply"
-- UPDATE loot_drops
-- SET total_value_gp = 1400000000
-- WHERE id = (
--   SELECT id FROM loot_drops
--   WHERE username = 'Spoopspooply' AND item_name ILIKE '%Twisted bow%'
--   ORDER BY at DESC LIMIT 1
-- );
