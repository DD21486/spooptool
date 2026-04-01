-- One-time manual loot: Araxyte fang for NewLineChar (Araxxor drop).
-- Run in Neon SQL Editor when DATABASE_URL is not available locally.
-- Value ~43.4M gp matches wiki “worth if used to upgrade amulet of torture”; item_id 29799 for sprite.

INSERT INTO loot_drops (character_id, username, item_id, item_name, quantity, total_value_gp, source, kill_count, rarity_text)
SELECT c.id, c.username, 29799, 'Araxyte fang', 1, 43427315, 'Araxxor', NULL, '1 in 600'
FROM characters c
WHERE LOWER(TRIM(c.username)) = LOWER(TRIM('NewLineChar'))
LIMIT 1;

INSERT INTO activity_log (username, type, description)
SELECT c.username, 'loot', 'Araxyte fang — 43.4M gp from Araxxor'
FROM characters c
WHERE LOWER(TRIM(c.username)) = LOWER(TRIM('NewLineChar'))
LIMIT 1;

-- Optional: trim activity feed to last 50 (matches API behavior)
-- DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY at DESC LIMIT 50);
