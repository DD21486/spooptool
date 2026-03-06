-- Run in Neon SQL Editor after migration_character_snapshots.sql.
-- Adds tables for the competitions feature.

CREATE TABLE IF NOT EXISTS competitions (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  type             VARCHAR(10)  NOT NULL CHECK (type IN ('solo', 'team')),
  category         VARCHAR(10)  NOT NULL CHECK (category IN ('skill', 'boss')),
  metric           VARCHAR(20)  NOT NULL CHECK (metric IN ('xp', 'ehp', 'kill-count', 'ehb')),
  skill_scope      VARCHAR(10)  CHECK (skill_scope IN ('total', 'specific')),
  skill            TEXT,                          -- shared specific skill (when same_skill_for_all = true)
  same_skill_for_all BOOLEAN DEFAULT TRUE,
  boss             TEXT,                          -- for boss competitions
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ NOT NULL,
  creator_code     CHAR(9)     NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Solo: one row per participant
CREATE TABLE IF NOT EXISTS competition_participants (
  id               SERIAL PRIMARY KEY,
  competition_id   INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  character_id     INTEGER NOT NULL REFERENCES characters(id)   ON DELETE CASCADE,
  skill            TEXT,                          -- per-participant skill (same_skill_for_all = false)
  UNIQUE (competition_id, character_id)
);

-- Team: one row per team
CREATE TABLE IF NOT EXISTS competition_teams (
  id               SERIAL PRIMARY KEY,
  competition_id   INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  skill            TEXT                           -- per-team skill (same_skill_for_all = false)
);

-- Team members: one row per (team, character) pair
CREATE TABLE IF NOT EXISTS competition_team_members (
  id               SERIAL PRIMARY KEY,
  team_id          INTEGER NOT NULL REFERENCES competition_teams(id) ON DELETE CASCADE,
  character_id     INTEGER NOT NULL REFERENCES characters(id)        ON DELETE CASCADE,
  UNIQUE (team_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_participants_comp ON competition_participants (competition_id);
CREATE INDEX IF NOT EXISTS idx_comp_teams_comp        ON competition_teams        (competition_id);
CREATE INDEX IF NOT EXISTS idx_comp_team_members_team ON competition_team_members (team_id);
