-- Run this in Neon SQL Editor to create the characters table
CREATE TABLE IF NOT EXISTS characters (
  id SERIAL PRIMARY KEY,
  username VARCHAR(12) NOT NULL UNIQUE,
  game_mode VARCHAR(20) DEFAULT 'main',
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with test character (run once)
-- INSERT INTO characters (username, game_mode) VALUES ('SpoopSpooply', 'main') ON CONFLICT (username) DO NOTHING;
