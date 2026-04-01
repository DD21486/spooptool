-- Add tracked characters (run in Neon after deploy, or use POST /api/characters for each name so Hiscores are validated).
-- OSRS usernames: max 12 characters. "Free Therapy" is 12 chars including the space.

INSERT INTO characters (username, game_mode) VALUES ('MuddYewGoo', 'main') ON CONFLICT (username) DO NOTHING;
INSERT INTO characters (username, game_mode) VALUES ('Free Therapy', 'main') ON CONFLICT (username) DO NOTHING;
