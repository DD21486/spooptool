-- Backfill weekly medal counts (run once in Neon SQL Editor).
-- Use this to set weekly_xp_wins, weekly_boss_wins, weekly_loot_wins for existing characters
-- so profiles show the correct medals after switching to the new tracking.
--
-- Format: one UPDATE per character. Username matching is case-insensitive.
-- Add or edit lines below, then run the whole script.

UPDATE characters SET weekly_xp_wins = 2, weekly_boss_wins = 3, weekly_loot_wins = 0 WHERE LOWER(TRIM(username)) = LOWER(TRIM('VDBL'));
UPDATE characters SET weekly_xp_wins = 0, weekly_boss_wins = 0, weekly_loot_wins = 3 WHERE LOWER(TRIM(username)) = LOWER(TRIM('NewLineChar'));
UPDATE characters SET weekly_xp_wins = 1, weekly_boss_wins = 0, weekly_loot_wins = 0 WHERE LOWER(TRIM(username)) = LOWER(TRIM('Legolad52'));
